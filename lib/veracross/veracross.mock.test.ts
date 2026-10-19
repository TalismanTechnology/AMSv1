import { after, afterEach, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import { startMockVeracross, type MockVeracross } from "./mock-server.test-helper";
import {
  DEFAULT_VERACROSS_ACCOUNTS_ORIGIN,
  DEFAULT_VERACROSS_API_ORIGIN,
  parseOriginOverride,
  resetVeracrossConfigWarningsForTests,
  veracrossAccountsOrigin,
  veracrossApiOrigin,
} from "./config";
import {
  exchangeVeracrossCode,
  fetchVeracrossUser,
  getVeracrossClientCredentialsToken,
  veracrossEndpoints,
} from "./oauth";
import { VERACROSS_DATA_SCOPES, lookupVeracrossFamily } from "./data-api";
import {
  clientTokenTtlSeconds,
  invalidateVeracrossClientToken,
  resetVeracrossTokenCacheForTests,
} from "./token-cache";
import { VeracrossHttpError, describeVeracrossFailure, logVeracrossFailure } from "./log";
import { buildVeracrossStart, identifyVeracrossParent } from "./sign-in";
import type { VeracrossConnection } from "./connection";
import { unpackLoginCookie, verifyVeracrossLoginState } from "../blackbaud/state";

process.env.BLACKBAUD_TOKEN_ENC_KEY = crypto.randomBytes(32).toString("base64");

const APP_ORIGIN = "https://askmyschool.test";
const REDIRECT_URI = `${APP_ORIGIN}/auth/veracross/callback`;

let mock: MockVeracross;
let connection: VeracrossConnection;
let clock = 0;

before(async () => {
  mock = await startMockVeracross();
  connection = {
    schoolId: "school-uuid",
    schoolRoute: mock.route,
    clientId: mock.clientId,
    scopes: "sso",
    parentRoles: ["Parent"],
    dataApiEnabled: true,
  };
});

after(async () => {
  await mock.close();
});

beforeEach(() => {
  delete process.env.VERCEL_ENV;
  delete process.env.VERACROSS_LOGIN_REDIRECT_URI;
  process.env.VERACROSS_ACCOUNTS_ORIGIN = mock.origin;
  process.env.VERACROSS_API_ORIGIN = mock.origin;
  resetVeracrossConfigWarningsForTests();
  mock.reset();
  clock = 1_000_000;
  resetVeracrossTokenCacheForTests({ now: () => clock });
});

afterEach(() => {
  delete process.env.VERACROSS_ACCOUNTS_ORIGIN;
  delete process.env.VERACROSS_API_ORIGIN;
  delete process.env.VERCEL_ENV;
});

const client = () => ({ schoolRoute: mock.route, clientId: mock.clientId });
const lookup = () =>
  lookupVeracrossFamily({
    connection,
    clientSecret: mock.clientSecret,
    username: "pat.parent@example.com",
  });

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (caught: unknown) {
    return caught;
  }
  assert.fail("expected a rejection");
}

// ── OAuth against the mock ───────────────────────────────

test("authorization-code exchange succeeds with the right client, code and verifier", async () => {
  const verifier = "v".repeat(43);
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const code = mock.issueCode({ redirectUri: REDIRECT_URI, codeChallenge: challenge });

  const token = await exchangeVeracrossCode({
    client: client(),
    clientSecret: mock.clientSecret,
    code,
    redirectUri: REDIRECT_URI,
    codeVerifier: verifier,
  });

  assert.match(token.access_token, /^user-/);
  assert.equal(mock.state.userTokensMinted, 1);
});

test("a wrong secret fails with the status and never leaks the secret", async () => {
  mock.state.echoSecretInErrors = true;
  const wrongSecret = "wrong-secret-should-not-appear";
  const code = mock.issueCode({ redirectUri: REDIRECT_URI });

  const caught = await captureRejection(
    exchangeVeracrossCode({
      client: client(),
      clientSecret: wrongSecret,
      code,
      redirectUri: REDIRECT_URI,
      codeVerifier: "x",
    })
  );

  assert.ok(caught instanceof VeracrossHttpError);
  assert.equal(caught.status, 401);
  assert.equal(caught.oauthError, "invalid_client");
  assert.match(caught.message, /\(401\)/);
  assert.ok(!caught.message.includes(wrongSecret));
  assert.ok(caught.message.includes("[redacted]"));
});

test("a reused code is invalid_grant, with a hint in the log line", async () => {
  const code = mock.issueCode({ redirectUri: REDIRECT_URI });
  const exchange = () =>
    exchangeVeracrossCode({
      client: client(),
      clientSecret: mock.clientSecret,
      code,
      redirectUri: REDIRECT_URI,
      codeVerifier: "x",
    });

  await exchange();
  const caught = await captureRejection(exchange());

  assert.ok(caught instanceof VeracrossHttpError);
  assert.equal(caught.status, 400);
  const line = describeVeracrossFailure({ step: "token", schoolId: "s", route: mock.route, error: caught });
  assert.equal(line.reason, "invalid_grant");
  assert.equal(line.hint, "code expired/used or redirect_uri mismatch");
});

test("userinfo is parsed from the documented shape", async () => {
  mock.state.userinfo = {
    sub: 5001,
    preferred_username: "pat",
    email: "pat@example.com",
    roles: ["Parent", "Donor"],
    given_name: "Pat",
    family_name: "Parent",
  };
  const code = mock.issueCode({ redirectUri: REDIRECT_URI });
  const token = await exchangeVeracrossCode({
    client: client(),
    clientSecret: mock.clientSecret,
    code,
    redirectUri: REDIRECT_URI,
    codeVerifier: "x",
  });

  assert.deepEqual(await fetchVeracrossUser(mock.route, token.access_token), {
    sub: "5001",
    username: "pat",
    email: "pat@example.com",
    roles: ["Parent", "Donor"],
    fullName: "Pat Parent",
  });

  const caught = await captureRejection(fetchVeracrossUser(mock.route, "not-a-token"));
  assert.ok(caught instanceof VeracrossHttpError);
  assert.equal(caught.step, "userinfo");
  assert.equal(caught.status, 401);
});

// ── start + callback cores ───────────────────────────────

test("start → authorize → callback core admits a parent end to end", async () => {
  const appChallenge = "a".repeat(43);
  const { authorizeUrl, cookieValue } = buildVeracrossStart({
    connection,
    schoolId: "school-uuid",
    schoolSlug: "mock",
    appChallenge,
    origin: APP_ORIGIN,
  });

  assert.ok(authorizeUrl.startsWith(`${mock.origin}/${mock.route}/oauth/authorize?`));
  const packed = unpackLoginCookie(cookieValue);
  assert.ok(packed);

  // The browser follows the authorize redirect back to our callback.
  const redirect = await fetch(authorizeUrl, { redirect: "manual" });
  assert.equal(redirect.status, 302);
  const callback = new URL(redirect.headers.get("location") ?? "");
  assert.equal(callback.origin + callback.pathname, REDIRECT_URI);

  const state = callback.searchParams.get("state");
  assert.deepEqual(verifyVeracrossLoginState(state ?? "", packed.state), {
    schoolId: "school-uuid",
    schoolSlug: "mock",
    appChallenge,
  });

  const result = await identifyVeracrossParent({
    connection,
    clientSecret: mock.clientSecret,
    code: callback.searchParams.get("code") ?? "",
    redirectUri: REDIRECT_URI,
    codeVerifier: packed.verifier,
  });

  assert.equal(result.ok, true);
  assert.ok(result.ok);
  assert.equal(result.user.sub, "5001");
  assert.deepEqual(result.decision, { allowed: true, email: "pat.parent@example.com" });
});

test("callback core: the PKCE verifier must match", async () => {
  const { authorizeUrl } = buildVeracrossStart({
    connection,
    schoolId: "school-uuid",
    schoolSlug: "mock",
    appChallenge: undefined,
    origin: APP_ORIGIN,
  });
  const redirect = await fetch(authorizeUrl, { redirect: "manual" });
  const code = new URL(redirect.headers.get("location") ?? "").searchParams.get("code") ?? "";

  const result = await identifyVeracrossParent({
    connection,
    clientSecret: mock.clientSecret,
    code,
    redirectUri: REDIRECT_URI,
    codeVerifier: "someone-elses-verifier",
  });

  assert.equal(result.ok, false);
  assert.ok(!result.ok);
  assert.equal(result.step, "token");
  assert.ok(result.error instanceof VeracrossHttpError);
  assert.equal(result.error.oauthError, "invalid_grant");
});

async function identifyWith(userinfo: Record<string, unknown>, parentRoles = ["Parent"]) {
  mock.state.userinfo = userinfo;
  return identifyVeracrossParent({
    connection: { ...connection, parentRoles },
    clientSecret: mock.clientSecret,
    code: mock.issueCode({ redirectUri: REDIRECT_URI }),
    redirectUri: REDIRECT_URI,
    codeVerifier: "x",
  });
}

test("callback core refuses faculty, and parents without email", async () => {
  const faculty = await identifyWith({ sub: "1", email: "t@example.com", roles: ["Faculty", "Staff"] });
  assert.ok(faculty.ok);
  assert.deepEqual(faculty.decision, { allowed: false, reason: "not_a_parent" });

  const noEmail = await identifyWith({ sub: "2", email: null, roles: ["Parent"] });
  assert.ok(noEmail.ok);
  assert.deepEqual(noEmail.decision, { allowed: false, reason: "no_email" });
});

test("'Parent of Future Student' is refused unless the school opts in", async () => {
  const futureParent = { sub: "3", email: "new@example.com", roles: ["Parent of Future Student"] };

  const byDefault = await identifyWith(futureParent);
  assert.ok(byDefault.ok);
  assert.equal(byDefault.decision.allowed, false);

  const optedIn = await identifyWith(futureParent, ["Parent", "Parent of Future Student"]);
  assert.ok(optedIn.ok);
  assert.deepEqual(optedIn.decision, { allowed: true, email: "new@example.com" });
});

test("callback core reports token and userinfo failures by step", async () => {
  const badToken = await identifyVeracrossParent({
    connection,
    clientSecret: "wrong",
    code: mock.issueCode({ redirectUri: REDIRECT_URI }),
    redirectUri: REDIRECT_URI,
    codeVerifier: "x",
  });
  assert.ok(!badToken.ok);
  assert.equal(badToken.step, "token");
  assert.equal(mock.state.userTokensMinted, 0);

  mock.state.userinfoStatus = 500;
  const badUserinfo = await identifyWith({ sub: "1", email: "p@example.com", roles: ["Parent"] });
  assert.ok(!badUserinfo.ok);
  assert.equal(badUserinfo.step, "userinfo");
  assert.ok(badUserinfo.error instanceof VeracrossHttpError);
  assert.equal(badUserinfo.error.status, 500);
});

test("redirect_uri must match the one the code was issued for", async () => {
  const result = await identifyVeracrossParent({
    connection,
    clientSecret: mock.clientSecret,
    code: mock.issueCode({ redirectUri: REDIRECT_URI }),
    redirectUri: "https://elsewhere.test/auth/veracross/callback",
    codeVerifier: "x",
  });
  assert.ok(!result.ok);
  assert.ok(result.error instanceof VeracrossHttpError);
  assert.equal(result.error.oauthError, "invalid_grant");
});

// ── Data API + client-credentials cache ──────────────────

test("lookupVeracrossFamily returns current children with mapped grades", async () => {
  const family = await lookup();

  assert.deepEqual(family, {
    personId: "100",
    children: [
      { externalId: "201", name: "Bobby Lee", grade: "K" },
      { externalId: "202", name: "Ann Lee", grade: "5" },
      { externalId: "204", name: "Cy Lee", grade: "Pre-K" },
    ],
  });
  assert.equal(mock.state.clientTokensMinted, 1);
});

test("an unknown username links nothing", async () => {
  mock.state.fixtures.personAccounts = [];
  assert.equal(await lookup(), null);
});

test("25 concurrent lookups mint exactly one client token", async () => {
  const results = await Promise.all(Array.from({ length: 25 }, () => lookup()));

  assert.equal(mock.state.clientTokensMinted, 1);
  for (const result of results) assert.deepEqual(result, results[0]);

  // And later sign-ins in the same instance reuse it.
  await lookup();
  assert.equal(mock.state.clientTokensMinted, 1);
});

test("a cached token is replaced after its TTL", async () => {
  await lookup();
  clock += 54 * 60 * 1000;
  await lookup();
  assert.equal(mock.state.clientTokensMinted, 1);

  clock += 2 * 60 * 1000; // 56 minutes in
  await lookup();
  assert.equal(mock.state.clientTokensMinted, 2);
});

test("TTL is min(expires_in - 5 min, 55 min)", async () => {
  assert.equal(clientTokenTtlSeconds(3600), 55 * 60);
  assert.equal(clientTokenTtlSeconds(7200), 55 * 60);
  assert.equal(clientTokenTtlSeconds(1800), 25 * 60);
  assert.equal(clientTokenTtlSeconds(null), 55 * 60);
  assert.equal(clientTokenTtlSeconds(undefined), 55 * 60);
  assert.equal(clientTokenTtlSeconds(0), 0);

  mock.state.expiresIn = 900; // reused for 10 minutes
  await lookup();
  clock += 11 * 60 * 1000;
  await lookup();
  assert.equal(mock.state.clientTokensMinted, 2);
});

test("a missing expires_in is cached for 55 minutes", async () => {
  mock.state.expiresIn = null;
  await lookup();
  clock += 54 * 60 * 1000;
  await lookup();
  assert.equal(mock.state.clientTokensMinted, 1);
});

test("failed token requests are not cached", async () => {
  mock.state.allowedDataScopes = [];
  const caught = await captureRejection(lookup());
  assert.ok(caught instanceof VeracrossHttpError);
  assert.equal(caught.step, "client_token");
  assert.equal(caught.oauthError, "invalid_scope");

  mock.reset();
  assert.ok(await lookup());
  assert.equal(mock.state.clientTokensMinted, 1);
});

test("a 401 from the Data API invalidates the token and retries once", async () => {
  mock.state.dataApi401Remaining = 1;
  const family = await lookup();

  assert.equal(family?.children.length, 3);
  assert.equal(mock.state.clientTokensMinted, 2);
});

test("a second 401 is an error, not a loop", async () => {
  mock.state.dataApi401Remaining = 2;
  const caught = await captureRejection(lookup());

  assert.ok(caught instanceof VeracrossHttpError);
  assert.equal(caught.status, 401);
  assert.equal(caught.step, "data_api");
  assert.equal(caught.endpoint, "/person_accounts");
  assert.equal(mock.state.clientTokensMinted, 2);
  assert.equal(mock.state.dataApiCalls.length, 2);

  const line = describeVeracrossFailure({ step: "data_api", schoolId: "s", error: caught });
  assert.equal(line.hint, "token expired or revoked (10-token cap?)");
});

test("a token revoked by the cap is replaced on the next sign-in", async () => {
  await lookup();
  mock.revokeClientTokens();

  // A burst of sign-ins all hit 401 with the revoked token; they share one
  // replacement rather than each minting their own.
  const results = await Promise.all(Array.from({ length: 5 }, () => lookup()));
  for (const result of results) assert.equal(result?.children.length, 3);
  assert.equal(mock.state.clientTokensMinted, 2);
});

test("invalidating with a stale token keeps a newer one", async () => {
  const request = { client: client(), clientSecret: mock.clientSecret, scopes: [...VERACROSS_DATA_SCOPES] };
  const first = await getVeracrossClientCredentialsToken(request);
  invalidateVeracrossClientToken({ ...client(), scopes: request.scopes }, first);
  const second = await getVeracrossClientCredentialsToken(request);
  assert.notEqual(first, second);

  invalidateVeracrossClientToken({ ...client(), scopes: request.scopes }, first);
  assert.equal(await getVeracrossClientCredentialsToken(request), second);

  // A whole connection (any scope set) can be dropped too; scope order
  // doesn't matter for the key.
  invalidateVeracrossClientToken(connection);
  const third = await getVeracrossClientCredentialsToken({
    ...request,
    scopes: [...request.scopes].reverse(),
  });
  assert.notEqual(third, second);
  assert.equal(mock.state.clientTokensMinted, 3);
});

// ── origin overrides ─────────────────────────────────────

test("origin overrides are validated", (t) => {
  const warn = t.mock.method(console, "warn", () => undefined);

  assert.equal(parseOriginOverride("http://127.0.0.1:4010/"), "http://127.0.0.1:4010");
  assert.equal(parseOriginOverride("http://localhost:3000/mock//"), "http://localhost:3000/mock");
  assert.equal(parseOriginOverride("https://vc-mock.example.com"), "https://vc-mock.example.com");
  for (const bad of ["not a url", "ftp://x.test", "http://evil.example", "https://u:p@x.test", "https://x.test/?a=1"]) {
    assert.equal(parseOriginOverride(bad), null, bad);
  }

  process.env.VERACROSS_ACCOUNTS_ORIGIN = "http://evil.example";
  process.env.VERACROSS_API_ORIGIN = "nope";
  assert.equal(veracrossAccountsOrigin(), DEFAULT_VERACROSS_ACCOUNTS_ORIGIN);
  assert.equal(veracrossApiOrigin(), DEFAULT_VERACROSS_API_ORIGIN);
  assert.equal(veracrossAccountsOrigin(), DEFAULT_VERACROSS_ACCOUNTS_ORIGIN);
  assert.equal(warn.mock.callCount(), 2); // once per variable, not per call

  process.env.VERACROSS_ACCOUNTS_ORIGIN = "https://staging-mock.test/";
  assert.deepEqual(veracrossEndpoints("polyprep").token, "https://staging-mock.test/polyprep/oauth/token");

  delete process.env.VERACROSS_ACCOUNTS_ORIGIN;
  assert.equal(veracrossEndpoints("polyprep").token, "https://accounts.veracross.com/polyprep/oauth/token");
});

test("production ignores overrides and warns once", (t) => {
  const warn = t.mock.method(console, "warn", () => undefined);
  process.env.VERCEL_ENV = "production";

  assert.equal(veracrossAccountsOrigin(), DEFAULT_VERACROSS_ACCOUNTS_ORIGIN);
  assert.equal(veracrossAccountsOrigin(), DEFAULT_VERACROSS_ACCOUNTS_ORIGIN);
  assert.equal(veracrossApiOrigin(), DEFAULT_VERACROSS_API_ORIGIN);
  assert.equal(warn.mock.callCount(), 2);
  assert.match(String(warn.mock.calls[0].arguments[0]), /ignored in production/);

  process.env.VERCEL_ENV = "preview";
  assert.equal(veracrossAccountsOrigin(), mock.origin);
});

// ── log lines ────────────────────────────────────────────

test("failure log lines carry step/school/route/status and no secrets", async (t) => {
  const error = t.mock.method(console, "error", () => undefined);
  mock.state.echoSecretInErrors = true;

  const caught = await captureRejection(
    getVeracrossClientCredentialsToken({
      client: client(),
      clientSecret: "SuperSecretValue1234567890",
      scopes: ["students:list"],
    })
  );
  logVeracrossFailure({ step: "client_token", schoolId: "school-uuid", route: mock.route, error: caught });

  assert.equal(error.mock.callCount(), 1);
  const line = String(error.mock.calls[0].arguments[0]);
  assert.ok(line.startsWith("[veracross] {"));
  const fields = JSON.parse(line.slice("[veracross] ".length));
  assert.deepEqual(fields, {
    event: "failure",
    step: "client_token",
    school: "school-uuid",
    route: mock.route,
    status: 401,
    reason: "invalid_client",
    hint: "client id/secret wrong or reset",
  });
  assert.ok(!line.includes("SuperSecretValue"));
});
