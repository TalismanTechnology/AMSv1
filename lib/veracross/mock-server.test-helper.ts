import crypto from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";

// A tiny stand-in for Veracross (accounts + Data API) on 127.0.0.1, for
// veracross.mock.test.ts. Point VERACROSS_ACCOUNTS_ORIGIN and
// VERACROSS_API_ORIGIN at `origin`. Implements just what lib/veracross uses,
// following the shapes in Veracross's API docs:
//
//   GET  /<route>/oauth/authorize     redirects to redirect_uri with code+state
//   POST /<route>/oauth/token         authorization_code | client_credentials
//   GET  /<route>/oauth/userinfo      Bearer (user token)
//   GET  /<route>/v3/...              Data API, Bearer (client token)
//
// Like the real thing, at most 10 client tokens are active; minting an 11th
// revokes the oldest.

export interface MockStudent {
  id: number;
  first_name: string;
  last_name: string;
  preferred_name?: string | null;
  grade_level: number | null;
  household_id: number;
  roles?: string | null;
}

export interface MockFixtures {
  personAccounts: { person_id: number; username: string }[];
  parents: { id: number; household_id: number | null }[];
  students: MockStudent[];
  relationships: {
    person_id: number;
    related_person_id: number;
    legal_custody?: boolean;
    parent_portal_access?: boolean;
  }[];
  gradeLevels: {
    id: number;
    grade_level?: string;
    abbreviation?: string;
    long_description?: string;
  }[];
}

export interface MockState {
  userinfo: Record<string, unknown>;
  /** Force userinfo to answer with this status. */
  userinfoStatus: number | null;
  fixtures: MockFixtures;
  /** Scopes the OAuth Application allows for client_credentials. */
  allowedDataScopes: string[];
  /** `expires_in` returned with tokens; null leaves it out. */
  expiresIn: number | null;
  /** Answer the next N Data API calls with 401. */
  dataApi401Remaining: number;
  /** Delay before answering a token request, so concurrent callers overlap. */
  tokenDelayMs: number;
  /** Put the posted client_secret in token error bodies (redaction test). */
  echoSecretInErrors: boolean;
  userTokensMinted: number;
  clientTokensMinted: number;
  dataApiCalls: string[];
}

export interface MockVeracross {
  origin: string;
  route: string;
  clientId: string;
  clientSecret: string;
  state: MockState;
  /** An authorization code as if the user had just approved sign-in. */
  issueCode(input: { redirectUri: string; codeChallenge?: string }): string;
  /** Revoke every active client token (as the 10-token cap would). */
  revokeClientTokens(): void;
  reset(): void;
  close(): Promise<void>;
}

const CLIENT_TOKEN_CAP = 10;

export function defaultFixtures(): MockFixtures {
  return {
    personAccounts: [{ person_id: 100, username: "pat.parent@example.com" }],
    parents: [{ id: 100, household_id: 7 }],
    students: [
      { id: 201, first_name: "Robert", preferred_name: "Bobby", last_name: "Lee", grade_level: 1, household_id: 7, roles: "Student" },
      { id: 202, first_name: "Ann", last_name: "Lee", grade_level: 2, household_id: 7, roles: "Student, Athlete" },
      { id: 203, first_name: "Old", last_name: "Lee", grade_level: 3, household_id: 7, roles: "Former Student" },
      // Lives in the other parent's household; found via relationships.
      { id: 204, first_name: "Cy", last_name: "Lee", grade_level: 3, household_id: 8, roles: "Student" },
    ],
    relationships: [
      { person_id: 100, related_person_id: 204, legal_custody: true },
      // Spouse: not a student, /students/{id} is 404.
      { person_id: 300, related_person_id: 100, parent_portal_access: true },
    ],
    gradeLevels: [
      { id: 1, abbreviation: "K", grade_level: "Kindergarten" },
      { id: 2, abbreviation: "05", grade_level: "Grade 5" },
      { id: 3, abbreviation: "PK", grade_level: "Pre-Kindergarten" },
    ],
  };
}

function initialState(): MockState {
  return {
    userinfo: {
      sub: "5001",
      preferred_username: "pat.parent@example.com",
      email: "pat.parent@example.com",
      roles: ["Parent"],
    },
    userinfoStatus: null,
    fixtures: defaultFixtures(),
    allowedDataScopes: [
      "person_accounts:list",
      "parents:read",
      "students:list",
      "students:read",
      "relationships:list",
      "academics.config.grade_levels:list",
    ],
    expiresIn: 3600,
    dataApi401Remaining: 0,
    tokenDelayMs: 20,
    echoSecretInErrors: false,
    userTokensMinted: 0,
    clientTokensMinted: 0,
    dataApiCalls: [],
  };
}

export async function startMockVeracross(
  options: { route?: string; clientId?: string; clientSecret?: string } = {}
): Promise<MockVeracross> {
  const route = options.route ?? "mockschool";
  const clientId = options.clientId ?? "mock-client-id";
  const clientSecret = options.clientSecret ?? "mock-client-secret-value";

  let state = initialState();
  const codes = new Map<string, { redirectUri: string; codeChallenge?: string }>();
  const userTokens = new Set<string>();
  let clientTokens: string[] = [];

  const issueCode: MockVeracross["issueCode"] = (input) => {
    const code = crypto.randomBytes(16).toString("hex");
    codes.set(code, input);
    return code;
  };

  const send = (res: http.ServerResponse, status: number, body: unknown, headers = {}) => {
    res.writeHead(status, { "Content-Type": "application/json", ...headers });
    res.end(body === undefined ? "" : JSON.stringify(body));
  };

  const bearer = (req: http.IncomingMessage) =>
    req.headers.authorization?.match(/^Bearer (.+)$/)?.[1] ?? null;

  async function readForm(req: http.IncomingMessage): Promise<URLSearchParams> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    return new URLSearchParams(Buffer.concat(chunks).toString("utf-8"));
  }

  async function token(req: http.IncomingMessage, res: http.ServerResponse) {
    const form = await readForm(req);
    await new Promise((done) => setTimeout(done, state.tokenDelayMs));

    if (form.get("client_id") !== clientId || form.get("client_secret") !== clientSecret) {
      const body: Record<string, string> = { error: "invalid_client" };
      if (state.echoSecretInErrors) body.error_description = `bad secret ${form.get("client_secret")}`;
      return send(res, 401, body);
    }

    const expires = state.expiresIn === null ? {} : { expires_in: state.expiresIn };

    if (form.get("grant_type") === "authorization_code") {
      const code = form.get("code") ?? "";
      const issued = codes.get(code);
      codes.delete(code); // single use
      if (!issued || issued.redirectUri !== form.get("redirect_uri")) {
        return send(res, 400, { error: "invalid_grant" });
      }
      if (issued.codeChallenge) {
        const challenge = crypto
          .createHash("sha256")
          .update(form.get("code_verifier") ?? "")
          .digest("base64url");
        if (challenge !== issued.codeChallenge) return send(res, 400, { error: "invalid_grant" });
      }
      const accessToken = `user-${crypto.randomBytes(8).toString("hex")}`;
      userTokens.add(accessToken);
      state.userTokensMinted += 1;
      return send(res, 200, { access_token: accessToken, token_type: "Bearer", ...expires });
    }

    if (form.get("grant_type") === "client_credentials") {
      const scopes = (form.get("scope") ?? "").split(" ").filter(Boolean);
      if (scopes.length === 0 || !scopes.every((scope) => state.allowedDataScopes.includes(scope))) {
        return send(res, 400, { error: "invalid_scope" });
      }
      const accessToken = `app-${crypto.randomBytes(8).toString("hex")}`;
      clientTokens.push(accessToken);
      if (clientTokens.length > CLIENT_TOKEN_CAP) clientTokens = clientTokens.slice(-CLIENT_TOKEN_CAP);
      state.clientTokensMinted += 1;
      return send(res, 200, {
        access_token: accessToken,
        token_type: "Bearer",
        scope: scopes.join(" "),
        ...expires,
      });
    }

    return send(res, 400, { error: "unsupported_grant_type" });
  }

  function dataApi(url: URL, path: string, req: http.IncomingMessage, res: http.ServerResponse) {
    state.dataApiCalls.push(path);
    const presented = bearer(req);
    if (!presented || !clientTokens.includes(presented)) return send(res, 401, { message: "Unauthorized" });
    if (state.dataApi401Remaining > 0) {
      state.dataApi401Remaining -= 1;
      return send(res, 401, { message: "Unauthorized" });
    }

    const f = state.fixtures;
    const q = (name: string) => url.searchParams.get(name);
    const studentRow = ({ household_id: _household, ...student }: MockStudent) => {
      void _household;
      return student;
    };
    let match: RegExpMatchArray | null;

    if (path === "/person_accounts") {
      return send(res, 200, { data: f.personAccounts.filter((row) => row.username === q("username")) });
    }
    if ((match = path.match(/^\/parents\/(\d+)$/))) {
      const parent = f.parents.find((row) => row.id === Number(match![1]));
      return parent ? send(res, 200, { data: parent }) : send(res, 404, { message: "Not found" });
    }
    if (path === "/students") {
      const household = Number(q("household_id"));
      return send(res, 200, {
        data: f.students.filter((row) => row.household_id === household).map(studentRow),
      });
    }
    if ((match = path.match(/^\/students\/(\d+)$/))) {
      const student = f.students.find((row) => row.id === Number(match![1]));
      return student
        ? send(res, 200, { data: studentRow(student) })
        : send(res, 404, { message: "Not found" });
    }
    if (path === "/relationships") {
      const person = Number(q("person_id"));
      return send(res, 200, {
        data: f.relationships.filter(
          (row) => row.person_id === person || row.related_person_id === person
        ),
      });
    }
    if (path === "/academics/config/grade_levels") {
      return send(res, 200, { data: f.gradeLevels });
    }
    return send(res, 404, { message: "Not found" });
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const prefix = `/${route}`;
    if (!url.pathname.startsWith(`${prefix}/`)) return send(res, 404, { message: "Unknown route" });
    const path = url.pathname.slice(prefix.length);

    if (req.method === "GET" && path === "/oauth/authorize") {
      const redirectUri = url.searchParams.get("redirect_uri") ?? "";
      if (url.searchParams.get("client_id") !== clientId || !redirectUri) {
        return send(res, 400, { error: "invalid_request" });
      }
      const code = issueCode({
        redirectUri,
        codeChallenge: url.searchParams.get("code_challenge") ?? undefined,
      });
      const target = new URL(redirectUri);
      target.searchParams.set("code", code);
      const returnedState = url.searchParams.get("state");
      if (returnedState) target.searchParams.set("state", returnedState);
      return send(res, 302, undefined, { Location: target.toString() });
    }

    if (req.method === "POST" && path === "/oauth/token") {
      token(req, res).catch(() => send(res, 500, { error: "server_error" }));
      return;
    }

    if (req.method === "GET" && path === "/oauth/userinfo") {
      const presented = bearer(req);
      if (!presented || !userTokens.has(presented)) return send(res, 401, { error: "invalid_token" });
      if (state.userinfoStatus) return send(res, state.userinfoStatus, { error: "server_error" });
      return send(res, 200, state.userinfo);
    }

    if (req.method === "GET" && path.startsWith("/v3/")) {
      return dataApi(url, path.slice("/v3".length), req, res);
    }

    return send(res, 404, { message: "Not found" });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  const mock: MockVeracross = {
    origin: `http://127.0.0.1:${port}`,
    route,
    clientId,
    clientSecret,
    get state() {
      return state;
    },
    set state(next) {
      state = next;
    },
    issueCode,
    revokeClientTokens() {
      clientTokens = [];
    },
    reset() {
      state = initialState();
      codes.clear();
      userTokens.clear();
      clientTokens = [];
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };

  return mock;
}
