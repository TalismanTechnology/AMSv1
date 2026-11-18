import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { NextRequest } from "next/server";

// Parents keep signing in with ADMIN_GOOGLE_ONLY on: the parent password
// sign-in (parent_password_login accounts, e.g. the App Review demo login)
// and "Continue with Google" for an existing approved parent, on the web
// (/auth/callback) and in the app (/auth/app-handoff). Supabase's HTTP API is
// stubbed.

const SUPABASE_URL = "https://testref.supabase.co";
const SITE = "https://askmyschool.app";
const COOKIE = "sb-testref-auth-token";

process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

const USER_ID = "22222222-2222-4222-8222-222222222222";
const SCHOOL_ID = "44444444-4444-4444-8444-444444444444";
const OTHER_SCHOOL_ID = "88888888-8888-4888-8888-888888888888";
const SLUG = "collegiate";
const NEW_SESSION = "66666666-6666-4666-8666-666666666666";
const EMAIL = "parent@example.com";

// ─── next/headers stand-in (no request scope under node:test) ─────────

const cookieJar = new Map<string, string>();
const headersPath = require.resolve("next/headers");
require.cache[headersPath] = {
  id: headersPath,
  filename: headersPath,
  loaded: true,
  exports: {
    cookies: async () => ({
      get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined),
      getAll: () => [...cookieJar].map(([name, value]) => ({ name, value })),
      has: (name: string) => cookieJar.has(name),
      set: (name: string, value: string) => {
        if (value) cookieJar.set(name, value);
        else cookieJar.delete(name);
      },
      delete: (name: string) => cookieJar.delete(name),
    }),
    headers: async () => new Headers(),
  },
} as unknown as NodeModule;

// ─── Supabase stub ────────────────────────────────────────────────────

interface Membership {
  role: "admin" | "parent";
  approved: boolean;
  schoolId: string;
  slug: string;
}

const state = {
  profileRole: "parent" as string,
  appMetadata: {} as Record<string, unknown>,
  memberships: [] as Membership[],
  googleInserted: [] as Record<string, unknown>[],
  handoffsInserted: [] as Record<string, unknown>[],
  handoff: null as null | { email: string; school_slug: string; app_challenge: string },
  logouts: 0,
};

beforeEach(() => {
  state.profileRole = "parent";
  state.appMetadata = {};
  state.memberships = [];
  state.googleInserted = [];
  state.handoffsInserted = [];
  state.handoff = null;
  state.logouts = 0;
  cookieJar.clear();
  process.env.GOOGLE_SIGNIN_ENABLED = "true";
  process.env.ADMIN_GOOGLE_ONLY = "true";
});

function user() {
  return {
    id: USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: EMAIL,
    app_metadata: state.appMetadata,
    user_metadata: {},
    identities: [
      { provider: "email", identity_data: { email: EMAIL } },
      { provider: "google", identity_data: { email: EMAIL, email_verified: true } },
    ],
    created_at: "2026-01-01T00:00:00Z",
  };
}

function jwt(amr: string): string {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${enc({ alg: "HS256", typ: "JWT" })}.${enc({
    sub: USER_ID,
    session_id: NEW_SESSION,
    exp: Math.floor(Date.now() / 1000) + 3600,
    role: "authenticated",
    amr: [{ method: amr, timestamp: 1 }],
  })}.sig`;
}

function session(amr: string) {
  return {
    access_token: jwt(amr),
    refresh_token: "refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: user(),
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** PostgREST: an object for .single(), else an array. */
function rows(request: Request, list: unknown[]): Response {
  if ((request.headers.get("accept") ?? "").includes("vnd.pgrst.object")) {
    if (list.length !== 1) {
      return json({ code: "PGRST116", details: `The result contains ${list.length} rows`, message: "JSON object requested, multiple (or no) rows returned" }, 406);
    }
    return json(list[0]);
  }
  return json(list);
}

const eq = (url: URL, name: string) => url.searchParams.get(name)?.replace(/^eq\./, "") ?? null;

const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const request = new Request(input as RequestInfo, init);
  const url = new URL(request.url);
  const table = url.pathname.startsWith("/rest/v1/") ? url.pathname.slice("/rest/v1/".length) : null;

  if (url.pathname === "/auth/v1/user") return json(user());
  if (url.pathname === "/auth/v1/logout") {
    state.logouts++;
    return new Response(null, { status: 204 });
  }
  if (url.pathname === "/auth/v1/token") {
    return json(session(url.searchParams.get("grant_type") === "password" ? "password" : "oauth"));
  }
  if (url.pathname === "/auth/v1/admin/generate_link") {
    return json({ ...user(), action_link: "x", email_otp: "1", hashed_token: "hashed", redirect_to: "x", verification_type: "magiclink" });
  }
  if (url.pathname === "/auth/v1/verify") return json(session("otp"));

  switch (table) {
    case "profiles":
      return rows(request, [{ role: state.profileRole, onboarding_completed: true }]);
    case "school_memberships": {
      const role = eq(url, "role");
      const approved = eq(url, "approved");
      const schoolId = eq(url, "school_id");
      const list = state.memberships
        .filter((m) => !role || m.role === role)
        .filter((m) => !approved || String(m.approved) === approved)
        .filter((m) => !schoolId || m.schoolId === schoolId)
        .map((m) => ({ id: "m", role: m.role, approved: m.approved, schools: { slug: m.slug } }));
      return rows(request, url.searchParams.get("limit") === "1" ? list.slice(0, 1) : list);
    }
    case "google_auth_sessions":
      if (request.method === "POST") {
        state.googleInserted.push(JSON.parse(await request.text()));
        return new Response(null, { status: 201 });
      }
      return rows(request, []);
    case "app_sign_in_handoffs":
      if (request.method === "POST") {
        state.handoffsInserted.push(JSON.parse(await request.text()));
        return new Response(null, { status: 201 });
      }
      return rows(request, state.handoff ? [state.handoff] : []);
  }
  throw new Error(`unexpected fetch ${request.method} ${url.href}`);
}) as typeof fetch;
process.on("exit", () => {
  globalThis.fetch = originalFetch;
});

const approvedParent = (): Membership => ({ role: "parent", approved: true, schoolId: SCHOOL_ID, slug: SLUG });
const adminHere = (): Membership => ({ role: "admin", approved: true, schoolId: SCHOOL_ID, slug: SLUG });

/** The path of a Next.js redirect() thrown from a server action. */
async function redirectedTo(run: () => Promise<unknown>): Promise<{ to: string | null; result: unknown }> {
  try {
    return { to: null, result: await run() };
  } catch (caught: unknown) {
    const digest = (caught as { digest?: string }).digest ?? "";
    if (!digest.startsWith("NEXT_REDIRECT")) throw caught;
    return { to: digest.split(";")[2], result: undefined };
  }
}

function passwordForm(fields: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.set("email", EMAIL);
  form.set("password", "correct horse");
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  return form;
}

const ADMIN_MESSAGE = "For security, admin access requires signing in with Google. Use Continue with Google.";

// ─── password sign-in (actions/auth.ts login) ─────────────────────────

test("flag on: a parent_password_login parent signs in with a password from /login/staff", async () => {
  state.appMetadata = { parent_password_login: true, providers: ["email", "google"] };
  state.memberships = [approvedParent()];
  const { login } = await import("@/actions/auth");
  const { to } = await redirectedTo(() => login(passwordForm()));
  assert.equal(to, `/s/${SLUG}/parent/chat`);
  assert.equal(state.logouts, 0);
});

test("flag on: a parent_password_login parent signs in from the school's login page", async () => {
  state.appMetadata = { parent_password_login: true };
  state.memberships = [approvedParent()];
  const { login } = await import("@/actions/auth");
  const { to } = await redirectedTo(() =>
    login(passwordForm({ school_slug: SLUG, school_id: SCHOOL_ID }))
  );
  assert.equal(to, `/s/${SLUG}/parent/chat`);

  // Another school's page: refused, as before.
  const other = await redirectedTo(() =>
    login(passwordForm({ school_slug: "oakridge", school_id: OTHER_SCHOOL_ID }))
  );
  assert.equal(other.to, null);
  assert.deepEqual(other.result, { error: "You do not have access to this school." });
});

test("flag on: an admin's password is still refused and signed out", async () => {
  state.appMetadata = { parent_password_login: true };
  state.memberships = [adminHere()];
  const { login } = await import("@/actions/auth");
  const { to, result } = await redirectedTo(() => login(passwordForm()));
  assert.equal(to, null);
  assert.deepEqual(result, { error: ADMIN_MESSAGE });
  assert.equal(state.logouts, 1);

  state.logouts = 0;
  state.memberships = [];
  state.profileRole = "super_admin";
  const superAdmin = await redirectedTo(() => login(passwordForm()));
  assert.deepEqual(superAdmin.result, { error: ADMIN_MESSAGE });
  assert.equal(state.logouts, 1);
});

test("a parent without parent_password_login still can't use a password", async () => {
  state.memberships = [approvedParent()];
  const { login } = await import("@/actions/auth");
  const { to, result } = await redirectedTo(() => login(passwordForm()));
  assert.equal(to, null);
  assert.match((result as { error: string }).error, /Parents sign in with their school account/);
  assert.equal(state.logouts, 1);
});

test("flags off: admin and parent password sign-in work exactly as before", async () => {
  delete process.env.ADMIN_GOOGLE_ONLY;
  delete process.env.GOOGLE_SIGNIN_ENABLED;
  const { login } = await import("@/actions/auth");

  state.memberships = [adminHere()];
  assert.equal((await redirectedTo(() => login(passwordForm()))).to, `/s/${SLUG}/admin`);

  state.memberships = [approvedParent()];
  state.appMetadata = { parent_password_login: true };
  assert.equal((await redirectedTo(() => login(passwordForm()))).to, `/s/${SLUG}/parent/chat`);
});

// ─── Google, web (/auth/callback) ─────────────────────────────────────

async function googleCallback(query = "code=abc", cookies: Record<string, string> = {}) {
  cookieJar.set(`${COOKIE}-code-verifier`, "base64-" + Buffer.from(JSON.stringify("verifier")).toString("base64url"));
  const request = new NextRequest(`${SITE}/auth/callback?${query}`);
  for (const [name, value] of Object.entries(cookies)) request.cookies.set(name, value);
  const { GET } = await import("@/app/auth/callback/route");
  return GET(request);
}

const location = (response: Response) => new URL(response.headers.get("location")!);

test("Google: an existing approved parent gets a parent session on their school's chat", async () => {
  state.appMetadata = { parent_password_login: true, providers: ["email", "google"] };
  state.memberships = [approvedParent()];
  const response = await googleCallback();
  assert.equal(location(response).pathname, `/s/${SLUG}/parent/chat`);
  assert.equal(state.logouts, 0);
  assert.deepEqual(state.googleInserted, [{ session_id: NEW_SESSION, user_id: USER_ID, via: "web" }]);
});

test("Google: from a school's login page, the parent lands on that school only", async () => {
  state.memberships = [approvedParent()];
  const here = await googleCallback(`code=abc&next=${encodeURIComponent(`/s/${SLUG}/admin`)}`);
  assert.equal(location(here).pathname, `/s/${SLUG}/parent/chat`);

  state.logouts = 0;
  const elsewhere = await googleCallback(`code=abc&next=${encodeURIComponent("/s/oakridge/admin")}`);
  assert.equal(location(elsewhere).pathname, "/s/oakridge/login");
  assert.match(location(elsewhere).searchParams.get("error")!, /doesn't have access to this school/);
  assert.equal(state.logouts, 1);
});

test("Google: an unapproved parent, or an account with no membership, is refused", async () => {
  state.memberships = [{ ...approvedParent(), approved: false }];
  const pending = await googleCallback();
  assert.equal(location(pending).pathname, "/login/staff");
  assert.equal(state.logouts, 1);
  assert.equal(state.googleInserted.length, 0);

  state.memberships = [];
  const none = await googleCallback();
  assert.equal(location(none).pathname, "/login/staff");
  assert.equal(state.logouts, 2);
});

test("Google: an unknown email is refused with a message that tells parents how to sign in", async () => {
  const response = await googleCallback(
    "error=access_denied&error_description=Signups+not+allowed+for+this+instance"
  );
  const message = location(response).searchParams.get("error")!;
  assert.equal(location(response).pathname, "/login/staff");
  assert.doesNotMatch(message, /admin account/);
  assert.match(message, /Parents: choose your school and sign in with Blackbaud, Veracross or the email code/);
});

test("Google: a dual admin + parent account still gets admin", async () => {
  state.memberships = [
    adminHere(),
    { role: "parent", approved: true, schoolId: OTHER_SCHOOL_ID, slug: "oakridge" },
  ];
  const response = await googleCallback();
  assert.equal(location(response).pathname, `/s/${SLUG}/admin`);
});

// ─── Google, native app (callback → /auth/app-handoff) ────────────────

test("Google in the app: the callback hands an approved parent back to the app", async () => {
  state.memberships = [approvedParent()];
  const { GOOGLE_INTENT_COOKIE, packGoogleIntent } = await import("./google-sign-in");
  const challenge = crypto.createHash("sha256").update("v".repeat(43)).digest("base64url");
  const response = await googleCallback("code=abc", {
    [GOOGLE_INTENT_COOKIE]: packGoogleIntent({ next: null, appChallenge: challenge }),
  });
  assert.match(response.headers.get("location")!, /^app\.askmyschool:\/\/auth-callback\?code=/);
  assert.equal(state.handoffsInserted.length, 1);
  assert.equal(state.handoffsInserted[0].school_slug, `google:${SLUG}`);
  assert.equal(state.handoffsInserted[0].email, EMAIL);
});

function handoffPost(code: string, verifier: string): Request {
  return new Request(`${SITE}/auth/app-handoff`, {
    method: "POST",
    headers: { origin: SITE, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, verifier }),
  });
}

function googleHandoff(slug: string) {
  const verifier = crypto.randomBytes(32).toString("base64url");
  state.handoff = {
    email: EMAIL,
    school_slug: `google:${slug}`,
    app_challenge: crypto.createHash("sha256").update(verifier).digest("base64url"),
  };
  return verifier;
}

test("Google in the app: the handoff starts a parent session on the school's chat", async () => {
  state.memberships = [approvedParent()];
  const verifier = googleHandoff(SLUG);
  const { POST } = await import("@/app/auth/app-handoff/route");
  const response = await POST(handoffPost("code", verifier));
  assert.equal(location(response).pathname, `/s/${SLUG}/parent/chat`);
  assert.deepEqual(state.googleInserted, [{ session_id: NEW_SESSION, user_id: USER_ID, via: "app" }]);
});

test("Google in the app: the handoff re-checks the membership before the session starts", async () => {
  state.memberships = [];
  const verifier = googleHandoff(SLUG);
  const { POST } = await import("@/app/auth/app-handoff/route");
  const response = await POST(handoffPost("code", verifier));
  assert.equal(location(response).pathname, `/s/${SLUG}/login`);
  assert.doesNotMatch(location(response).searchParams.get("error")!, /admin account/);
  assert.equal(state.googleInserted.length, 0);
});
