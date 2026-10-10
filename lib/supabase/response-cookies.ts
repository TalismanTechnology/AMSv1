// Helpers for carrying refreshed Supabase auth cookies through the middleware.
//
// Refresh tokens are single-use. When the middleware's getUser() refreshes the
// session, Supabase has already retired the old refresh token, so the new one
// MUST reach the browser on whatever response the middleware returns —
// redirects included. If it is dropped, the browser keeps the retired token,
// the next refresh fails, and the user is signed out.
//
// Pure (no network, no request context) so it can be unit-tested directly.

import type { NextResponse } from "next/server";

// What newer @supabase/ssr versions send with refreshed auth cookies, so no
// CDN or shared cache stores one user's session cookies for another.
export const AUTH_NO_STORE_CACHE_CONTROL =
  "private, no-cache, no-store, must-revalidate, max-age=0";

/**
 * Copies every cookie (with its options — maxAge, path, secure, …) from
 * `from` onto `to`, and marks `to` as uncacheable when there were any.
 * Returns `to`.
 */
export function copyResponseCookies<T extends NextResponse>(
  from: NextResponse,
  to: T
): T {
  const cookies = from.cookies.getAll();
  for (const cookie of cookies) {
    to.cookies.set({ ...cookie });
  }
  if (cookies.length > 0) {
    to.headers.set("Cache-Control", AUTH_NO_STORE_CACHE_CONTROL);
  }
  return to;
}

/**
 * True when getUser() failed because Supabase Auth couldn't be reached or
 * had a server error — not because the session is missing or invalid. In
 * that case the user may well still be signed in; don't send them to a login
 * screen (and never grant access either).
 */
export function isTransientAuthError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { name, status } = error as { name?: unknown; status?: unknown };
  if (name === "AuthRetryableFetchError") return true;
  return typeof status === "number" && status >= 500;
}
