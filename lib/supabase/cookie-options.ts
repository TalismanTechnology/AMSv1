import type { CookieOptionsWithName } from "@supabase/ssr";

// Options for the Supabase auth cookies, shared by the middleware, server and
// browser clients so every writer produces the same cookie.
//
// Parents and staff should stay signed in until they sign out. The session's
// real lifetime is the refresh token's (managed by Supabase Auth); the cookie
// only has to outlive it, so it gets the longest lifetime browsers allow
// (400 days, Chrome's cap). @supabase/ssr already defaults to this, but it is
// spelled out so a library change can't quietly shorten it.
//
// Not httpOnly: the browser client reads and refreshes the session through
// document.cookie. `secure` is off in development so http://localhost works.

export const AUTH_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

/**
 * True for a Supabase session cookie: `sb-<ref>-auth-token`, or one of the
 * `.0`, `.1`, … chunks @supabase/ssr splits a large session into. (Not the
 * `-code-verifier` cookie, which exists before anyone is signed in.)
 */
export function isAuthCookieName(name: string): boolean {
  return /^sb-.+-auth-token(\.\d+)?$/.test(name);
}

export function authCookieOptions(
  env: string | undefined = process.env.NODE_ENV
): CookieOptionsWithName {
  return {
    path: "/",
    sameSite: "lax",
    secure: env === "production",
    maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
  };
}
