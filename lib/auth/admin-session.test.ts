import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { NextRequest } from "next/server";

// ADMIN_GOOGLE_ONLY end to end with Supabase's HTTP API stubbed: recording
// Google sessions (/auth/callback, /auth/app-handoff), the shared guards
// (requireSchoolAdmin, requireSuperAdmin, requireSchoolContext,
// schoolLockError) and the middleware gate, with the flag off and on.

const SUPABASE_URL = "https://testref.supabase.co";
const SITE = "https://askmyschool.app";
const COOKIE = "sb-testref-auth-token";

process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
process.env.GOOGLE_SIGNIN_ENABLED = "true";

const USER_ID = "22222222-2222-4222-8222-222222222222";
const SCHOOL_ID = "44444444-4444-4444-8444-444444444444";
const SLUG = "greenwood";
const GOOGLE_SESSION = "33333333-3333-4333-8333-333333333333";
const OTHER_SESSION = "55555555-5555-4555-8555-555555555555";
const NEW_SESSION = "66666666-6666-4666-8666-666666666666";

const USER = {
  id: USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: "lucas@example.com",
  app_metadata: {},
  user_metadata: {},
  identities: [
    {
      provider: "google",
      identity_data: { email: "lucas@example.com", email_verified: true },
    },
  ],
  created_at: "2026-01-01T00:00:00Z",
};

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

// ─── tokens and sessions ──────────────────────────────────────────────

function jwt(sessionId: string, amr: string): string {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${enc({ alg: "HS256", typ: "JWT" })}.${enc({
    sub: USER_ID,
    session_id: sessionId,
    exp: Math.floor(Date.now() / 1000) + 3600,
    role: "authenticated",
    amr: [{ method: amr, timestamp: 1 }],
  })}.sig`;
}

function sessionFor(sessionId: string, amr = "otp") {
  return {
    access_token: jwt(sessionId, amr),
    refresh_token: "refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: USER,
  };
}

const encodeCookie = (value: unknown) =>
  "base64-" + Buffer.from(JSON.stringify(value)).toString("base64url");

/** Signs the fake browser in with a session (Google or not). */
function signIn(sessionId: string, amr = "otp") {
  cookieJar.clear();
  cookieJar.set(COOKIE, encodeCookie(sessionFor(sessionId, amr)));
}

function requestWithSession(pathname: string, sessionId: string): NextRequest {
  const request = new NextRequest(`${SITE}${pathname}`);
  request.cookies.set(COOKIE, encodeCookie(sessionFor(sessionId)));
  return request;
}

// ─── Supabase stub ────────────────────────────────────────────────────

const state = {
  profileRole: "parent" as string,
  membership: null as { role: string; approved: boolean } | null,
  googleSessions: new Set<string>(),
  inserted: [] as Record<string, unknown>[],
  insertFails: false,
  googleLookups: 0,
  handoff: null as null | { email: string; school_slug: string; app_challenge: string },
};

beforeEach(() => {
  state.profileRole = "parent";
  state.membership = null;
  state.googleSessions = new Set([GOOGLE_SESSION]);
  state.inserted = [];
  state.insertFails = false;
  state.googleLookups = 0;
  state.handoff = null;
  cookieJar.clear();
  delete process.env.ADMIN_GOOGLE_ONLY;
});

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

const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const request = new Request(input as RequestInfo, init);
  const url = new URL(request.url);
  const table = url.pathname.startsWith("/rest/v1/") ? url.pathname.slice("/rest/v1/".length) : null;

  if (url.pathname === "/auth/v1/user") return json(USER);
  if (url.pathname === "/auth/v1/logout") return new Response(null, { status: 204 });
  if (url.pathname === "/auth/v1/token") return json(sessionFor(NEW_SESSION, "oauth"));
  if (url.pathname === "/auth/v1/admin/generate_link") {
    return json({ ...USER, action_link: "x", email_otp: "1", hashed_token: "hashed", redirect_to: "x", verification_type: "magiclink" });
  }
  if (url.pathname === "/auth/v1/verify") return json(sessionFor(NEW_SESSION, "otp"));

  switch (table) {
    case "profiles":
      return rows(request, [{ role: state.profileRole, onboarding_completed: true }]);
    case "school_memberships": {
      if (url.searchParams.get("role") === "eq.admin") {
        return rows(request, state.membership?.role === "admin" ? [{ id: "m", schools: { slug: SLUG } }] : []);
      }
      return rows(request, state.membership ? [{ id: "m", ...state.membership }] : []);
    }
    case "schools":
      return rows(request, [{ id: SCHOOL_ID, slug: SLUG, name: "Greenwood" }]);
    case "google_auth_sessions": {
      if (request.method === "POST") {
        if (state.insertFails) return json({ message: "relation does not exist", code: "42P01" }, 404);
        state.inserted.push(JSON.parse(await request.text()));
        return new Response(null, { status: 201 });
      }
      state.googleLookups++;
      const id = url.searchParams.get("session_id")?.replace(/^eq\./, "") ?? "";
      const user = url.searchParams.get("user_id")?.replace(/^eq\./, "") ?? "";
      return rows(request, state.googleSessions.has(id) && user === USER_ID ? [{ session_id: id }] : []);
    }
    case "app_sign_in_handoffs":
      return rows(request, state.handoff ? [state.handoff] : []);
    case "school_owner_locks":
    case "settings":
      return rows(request, []);
  }
  throw new Error(`unexpected fetch ${request.method} ${url.href}`);
}) as typeof fetch;
process.on("exit", () => {
  globalThis.fetch = originalFetch;
});

const flagOn = () => {
  process.env.ADMIN_GOOGLE_ONLY = "true";
};

/** The path of a Next.js redirect() thrown from a server component. */
async function redirectedTo(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (caught: unknown) {
    const digest = (caught as { digest?: string }).digest ?? "";
    if (!digest.startsWith("NEXT_REDIRECT")) throw caught;
    return digest.split(";")[2];
  }
}

// ─── recording ────────────────────────────────────────────────────────

test("recordGoogleSession stores the token's session id for its user", async () => {
  const { recordGoogleSession } = await import("./admin-session");
  const ok = await recordGoogleSession({ accessToken: jwt(NEW_SESSION, "oauth"), userId: USER_ID, via: "web" });
  assert.equal(ok, true);
  assert.deepEqual(state.inserted, [{ session_id: NEW_SESSION, user_id: USER_ID, via: "web" }]);
});

test("recordGoogleSession refuses a token for someone else, and never throws", async () => {
  const { recordGoogleSession } = await import("./admin-session");
  const other = "77777777-7777-4777-8777-777777777777";
  assert.equal(await recordGoogleSession({ accessToken: jwt(NEW_SESSION, "oauth"), userId: other, via: "web" }), false);
  assert.equal(await recordGoogleSession({ accessToken: undefined, userId: USER_ID, via: "app" }), false);
  assert.equal(state.inserted.length, 0);

  state.insertFails = true;
  assert.equal(await recordGoogleSession({ accessToken: jwt(NEW_SESSION, "oauth"), userId: USER_ID, via: "app" }), false);
});

test("the web callback records the new session as a Google one", async () => {
  state.profileRole = "super_admin";
  cookieJar.set(`${COOKIE}-code-verifier`, encodeCookie("verifier"));
  const { GET } = await import("@/app/auth/callback/route");
  const response = await GET(new NextRequest(`${SITE}/auth/callback?code=abc`));
  assert.equal(new URL(response.headers.get("location")!).pathname, "/super-admin");
  assert.deepEqual(state.inserted, [{ session_id: NEW_SESSION, user_id: USER_ID, via: "web" }]);
});

test("a failed recording doesn't fail the sign-in", async () => {
  state.profileRole = "super_admin";
  state.insertFails = true;
  cookieJar.set(`${COOKIE}-code-verifier`, encodeCookie("verifier"));
  const { GET } = await import("@/app/auth/callback/route");
  const response = await GET(new NextRequest(`${SITE}/auth/callback?code=abc`));
  assert.equal(new URL(response.headers.get("location")!).pathname, "/super-admin");
});

function handoffPost(code: string, verifier: string): Request {
  const body = new URLSearchParams({ code, verifier });
  return new Request(`${SITE}/auth/app-handoff`, {
    method: "POST",
    headers: { origin: SITE, "content-type": "application/x-www-form-urlencoded" },
    body,
  });
}

test("the app handoff records the staff Google session (whose amr is otp)", async () => {
  state.membership = { role: "admin", approved: true };
  const verifier = crypto.randomBytes(32).toString("base64url");
  state.handoff = {
    email: USER.email,
    school_slug: `google:${SLUG}`,
    app_challenge: crypto.createHash("sha256").update(verifier).digest("base64url"),
  };
  const { POST } = await import("@/app/auth/app-handoff/route");
  const response = await POST(handoffPost("code", verifier));
  assert.equal(new URL(response.headers.get("location")!).pathname, `/s/${SLUG}/admin`);
  assert.deepEqual(state.inserted, [{ session_id: NEW_SESSION, user_id: USER_ID, via: "app" }]);
});

test("a parent (Blackbaud) handoff is never recorded as Google", async () => {
  const verifier = crypto.randomBytes(32).toString("base64url");
  state.handoff = {
    email: USER.email,
    school_slug: SLUG,
    app_challenge: crypto.createHash("sha256").update(verifier).digest("base64url"),
  };
  // Already secured, so startParentSession doesn't touch other sessions.
  const secured = { ...USER, app_metadata: { parent_secured_at: "2026-01-01" } };
  const verify = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(new Request(input as RequestInfo, init).url);
    if (url.pathname === "/auth/v1/verify") return json({ ...sessionFor(NEW_SESSION), user: secured });
    return verify(input, init);
  }) as typeof fetch;
  try {
    const { POST } = await import("@/app/auth/app-handoff/route");
    const response = await POST(handoffPost("code", verifier));
    assert.equal(new URL(response.headers.get("location")!).pathname, `/s/${SLUG}/parent/chat`);
    assert.equal(state.inserted.length, 0);
  } finally {
    globalThis.fetch = verify;
  }
});

test("createAppHandoff refuses a Google slug", async () => {
  const { createAppHandoff } = await import("./app-handoff");
  await assert.rejects(
    createAppHandoff({ email: USER.email, schoolSlug: `google:${SLUG}`, appChallenge: "a".repeat(43) }),
    /not a school slug/
  );
});

// ─── requireSchoolAdmin / requireSuperAdmin ───────────────────────────

const MESSAGE = "For security, admin access requires signing in with Google. Use Continue with Google.";

test("flag off: a non-Google admin session works exactly as before", async () => {
  const { requireSchoolAdmin, requireSuperAdmin } = await import("./require-school-admin");
  signIn(OTHER_SESSION, "password");
  state.membership = { role: "admin", approved: true };
  assert.deepEqual(await requireSchoolAdmin(SCHOOL_ID), { userId: USER_ID });
  state.profileRole = "super_admin";
  state.membership = null;
  assert.deepEqual(await requireSchoolAdmin(SCHOOL_ID), { userId: USER_ID });
  assert.deepEqual(await requireSuperAdmin(), { userId: USER_ID });
  assert.equal(state.googleLookups, 0, "no lookup while the flag is off");
});

test("flag on: requireSchoolAdmin refuses a non-Google admin, allows a Google one", async () => {
  flagOn();
  const { requireSchoolAdmin } = await import("./require-school-admin");
  state.membership = { role: "admin", approved: true };

  signIn(OTHER_SESSION);
  assert.deepEqual(await requireSchoolAdmin(SCHOOL_ID), { error: MESSAGE });
  signIn(GOOGLE_SESSION);
  assert.deepEqual(await requireSchoolAdmin(SCHOOL_ID), { userId: USER_ID });
});

test("flag on: a Google session id recorded for another user doesn't count", async () => {
  flagOn();
  const { requireSchoolAdmin } = await import("./require-school-admin");
  state.membership = { role: "admin", approved: true };
  state.googleSessions = new Set();
  signIn(GOOGLE_SESSION);
  assert.deepEqual(await requireSchoolAdmin(SCHOOL_ID), { error: MESSAGE });
});

test("flag on: requireSuperAdmin and super-admin elevation need a Google session", async () => {
  flagOn();
  const { requireSchoolAdmin, requireSuperAdmin } = await import("./require-school-admin");
  state.profileRole = "super_admin";

  signIn(OTHER_SESSION);
  assert.deepEqual(await requireSuperAdmin(), { error: MESSAGE });
  assert.deepEqual(await requireSchoolAdmin(SCHOOL_ID), { error: MESSAGE });

  signIn(GOOGLE_SESSION, "oauth");
  assert.deepEqual(await requireSuperAdmin(), { userId: USER_ID });
  assert.deepEqual(await requireSchoolAdmin(SCHOOL_ID), { userId: USER_ID });
});

test("flag on: parents get the same answer as before, with no lookup", async () => {
  flagOn();
  const { requireSchoolAdmin } = await import("./require-school-admin");
  state.membership = { role: "parent", approved: true };
  signIn(OTHER_SESSION);
  assert.deepEqual(await requireSchoolAdmin(SCHOOL_ID), {
    error: "You do not have permission to manage this school",
  });
  assert.equal(state.googleLookups, 0);
});

// ─── schoolLockError (RLS-backed actions and API routes) ──────────────

test("schoolLockError refuses a non-Google admin only while the flag is on", async () => {
  const { schoolLockError, schoolAccessErrorStatus } = await import("@/lib/school-lock/access");
  state.membership = { role: "admin", approved: true };
  signIn(OTHER_SESSION);
  assert.equal(await schoolLockError(SCHOOL_ID, "admin", USER_ID), null);

  flagOn();
  assert.equal(await schoolLockError(SCHOOL_ID, "admin", USER_ID), MESSAGE);
  assert.equal(await schoolLockError(SCHOOL_ID, "member", USER_ID), MESSAGE);
  assert.equal(schoolAccessErrorStatus(MESSAGE), 403);

  signIn(GOOGLE_SESSION);
  assert.equal(await schoolLockError(SCHOOL_ID, "admin", USER_ID), null);

  state.membership = { role: "parent", approved: true };
  signIn(OTHER_SESSION);
  assert.equal(await schoolLockError(SCHOOL_ID, "member", USER_ID), null);
});

// ─── requireSchoolContext (pages) ─────────────────────────────────────

test("requireSchoolContext: flag on sends a non-Google admin to staff sign-in", async () => {
  const { requireSchoolContext } = await import("@/lib/school-context");
  state.membership = { role: "admin", approved: true };
  signIn(OTHER_SESSION);

  const before = await requireSchoolContext(SLUG);
  assert.equal(before.role, "admin");

  flagOn();
  const to = await redirectedTo(() => requireSchoolContext(SLUG));
  assert.equal(new URL(to!, SITE).pathname, "/login/staff");
  assert.equal(new URL(to!, SITE).searchParams.get("error"), MESSAGE);

  signIn(GOOGLE_SESSION);
  assert.equal((await requireSchoolContext(SLUG)).role, "admin");
});

test("requireSchoolContext: flag on, the super-admin is never elevated without Google", async () => {
  flagOn();
  const { requireSchoolContext } = await import("@/lib/school-context");
  state.profileRole = "super_admin";

  signIn(OTHER_SESSION);
  assert.match((await redirectedTo(() => requireSchoolContext(SLUG)))!, /^\/login\/staff\?error=/);
  // Not even as a parent where they have a parent membership.
  state.membership = { role: "parent", approved: true };
  assert.match((await redirectedTo(() => requireSchoolContext(SLUG)))!, /^\/login\/staff\?error=/);

  signIn(GOOGLE_SESSION);
  const context = await requireSchoolContext(SLUG);
  assert.equal(context.isSuperAdmin, true);
  assert.equal(context.role, "admin");
});

test("requireSchoolContext: parents are unaffected", async () => {
  flagOn();
  const { requireSchoolContext } = await import("@/lib/school-context");
  state.membership = { role: "parent", approved: true };
  signIn(OTHER_SESSION);
  const context = await requireSchoolContext(SLUG);
  assert.equal(context.role, "parent");
  assert.equal(context.isSuperAdmin, false);
  assert.equal(state.googleLookups, 0);
});

// ─── middleware ───────────────────────────────────────────────────────

test("middleware: flag on stops a non-Google admin at /s/…/admin and /super-admin", async () => {
  const { updateSession } = await import("@/lib/supabase/middleware");
  state.membership = { role: "admin", approved: true };

  let response = await updateSession(requestWithSession(`/s/${SLUG}/admin`, OTHER_SESSION));
  assert.equal(response.headers.get("location"), null, "flag off: through");

  flagOn();
  response = await updateSession(requestWithSession(`/s/${SLUG}/admin`, OTHER_SESSION));
  const location = new URL(response.headers.get("location")!);
  assert.equal(location.pathname, "/login/staff");
  assert.equal(location.searchParams.get("error"), MESSAGE);

  response = await updateSession(requestWithSession(`/s/${SLUG}/admin`, GOOGLE_SESSION));
  assert.equal(response.headers.get("location"), null, "Google session: through");

  state.profileRole = "super_admin";
  state.membership = null;
  response = await updateSession(requestWithSession("/super-admin", OTHER_SESSION));
  assert.equal(new URL(response.headers.get("location")!).pathname, "/login/staff");
  response = await updateSession(requestWithSession("/super-admin", GOOGLE_SESSION));
  assert.equal(response.headers.get("location"), null);
});

test("middleware: a non-Google admin on the sign-in pages isn't bounced back to /admin", async () => {
  flagOn();
  const { updateSession } = await import("@/lib/supabase/middleware");
  state.membership = { role: "admin", approved: true };
  for (const path of ["/login/staff", `/s/${SLUG}/login`]) {
    const response = await updateSession(requestWithSession(path, OTHER_SESSION));
    assert.equal(response.headers.get("location"), null, path);
  }
});

test("middleware: parents pay no lookup with the flag on", async () => {
  flagOn();
  const { updateSession } = await import("@/lib/supabase/middleware");
  state.membership = { role: "parent", approved: true };
  const response = await updateSession(requestWithSession(`/s/${SLUG}/parent/chat`, OTHER_SESSION));
  assert.equal(response.headers.get("location"), null);
  assert.equal(state.googleLookups, 0);
});
