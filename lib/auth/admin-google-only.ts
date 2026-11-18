// "Admins sign in with Google only" (ADMIN_GOOGLE_ONLY).
//
// When on, admin powers (a school's `admin` membership, and the platform
// super-admin's elevation) only count for a session that was started by a
// Google sign-in. Any other session — password, parent email code, magic link,
// Blackbaud / Veracross — still works for whatever else the account is (a
// parent at some school), but never as an admin.
//
// Which sessions are Google sessions: /auth/callback (web) and
// /auth/app-handoff (native app) record the new session's id in
// public.google_auth_sessions (service role only, migration 053). The access
// token's session_id claim survives token refreshes, so the mark lasts as long
// as the session. The token's `amr` can't tell us: the native app's Google
// sign-in ends in a magic-link verify, so its session says "otp", exactly like
// a parent's email code.
//
// Everything here is pure (and edge-safe) so it can be unit tested and used
// from middleware; the lookups are in admin-session.ts.

/** Server-side flag. Off unless set to exactly "true". */
export const ADMIN_GOOGLE_ONLY_FLAG = "ADMIN_GOOGLE_ONLY";

export function isAdminGoogleOnlyEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env[ADMIN_GOOGLE_ONLY_FLAG]?.trim() === "true";
}

/**
 * ADMIN_GOOGLE_ONLY without GOOGLE_SIGNIN_ENABLED leaves admins no way in at
 * all. That's not silently "fixed" by falling back to passwords; it's logged
 * so the misconfiguration shows up in the server logs.
 */
export function adminsLockedOut(env: Record<string, string | undefined> = process.env): boolean {
  return isAdminGoogleOnlyEnabled(env) && env.GOOGLE_SIGNIN_ENABLED?.trim().toLowerCase() !== "true";
}

export function warnIfAdminsLockedOut(env: Record<string, string | undefined> = process.env): void {
  if (adminsLockedOut(env)) {
    console.warn(
      "[admin-google-only] ADMIN_GOOGLE_ONLY=true but GOOGLE_SIGNIN_ENABLED is off: no admin or super-admin can sign in. Turn Google sign-in on, or ADMIN_GOOGLE_ONLY off."
    );
  }
}

/**
 * What the staff sign-in forms (/login/staff, the staff section of
 * /s/<slug>/login) offer:
 * - "password": Google sign-in off (today's default).
 * - "google-and-password": Google sign-in on, ADMIN_GOOGLE_ONLY off.
 * - "google-only": both on; no password form.
 * - "unavailable": ADMIN_GOOGLE_ONLY on, Google sign-in off: no admin can
 *   sign in (see adminsLockedOut).
 */
export type StaffSignInMode = "password" | "google-and-password" | "google-only" | "unavailable";

export function staffSignInMode(env: Record<string, string | undefined> = process.env): StaffSignInMode {
  const google = env.GOOGLE_SIGNIN_ENABLED?.trim().toLowerCase() === "true";
  if (isAdminGoogleOnlyEnabled(env)) return google ? "google-only" : "unavailable";
  return google ? "google-and-password" : "password";
}

/**
 * How the staff forms offer email + password, given the mode:
 * - "open": the password form is shown, as before ADMIN_GOOGLE_ONLY.
 * - "parent-link": ADMIN_GOOGLE_ONLY is on, so admins can't use a password.
 *   Parents whose account allows one (app_metadata.parent_password_login,
 *   e.g. the App Review demo account) still can: the form sits behind a quiet
 *   "parent with a password" link. login() still refuses admin-capable
 *   accounts, so this never gives an admin a way in.
 */
export type StaffPasswordForm = "open" | "parent-link";

export function staffPasswordForm(mode: StaffSignInMode): StaffPasswordForm {
  return mode === "password" || mode === "google-and-password" ? "open" : "parent-link";
}

export const PARENT_PASSWORD_LINK_LABEL = "A parent with a password? Sign in with email and password";
export const PARENT_PASSWORD_FORM_NOTE =
  "For parent accounts that have an AskMySchool password. Admins sign in with Google.";

export const ADMIN_SIGN_IN_UNAVAILABLE_MESSAGE =
  "Admin sign-in is unavailable right now. Please contact AskMySchool support.";

export const ADMIN_GOOGLE_ONLY_MESSAGE =
  "For security, admin access requires signing in with Google. Use Continue with Google.";

/** Where an admin without a Google session is sent. */
export const ADMIN_GOOGLE_ONLY_LOGIN_PATH = `/login/staff?error=${encodeURIComponent(
  ADMIN_GOOGLE_ONLY_MESSAGE
)}`;

export type AdminSessionDecision =
  /** Admin powers (if any) apply as usual. */
  | "allow"
  /** No admin powers; the account's own parent membership still applies. */
  | "parent-only"
  /** No admin powers and nothing else to fall back on: sign in with Google. */
  | "require-google";

/**
 * Whether this session may use the admin powers the account has.
 *
 * - flag off: always "allow" (today's behaviour).
 * - not admin-capable (parents, no role): "allow"; there's nothing to grant,
 *   and the caller's own checks decide as before.
 * - admin-capable with a Google session: "allow".
 * - admin-capable without one: "parent-only" when the account also has a
 *   (non-admin) membership to fall back on in this context, else
 *   "require-google".
 */
export function decideAdminSession(input: {
  enabled: boolean;
  isAdminCapable: boolean;
  sessionIsGoogle: boolean;
  hasParentFallback?: boolean;
}): AdminSessionDecision {
  if (!input.enabled || !input.isAdminCapable || input.sessionIsGoogle) return "allow";
  return input.hasParentFallback ? "parent-only" : "require-google";
}

/**
 * The decision for one school, given the requester's platform role and their
 * own membership there.
 *
 * There is no parent fallback in a school context:
 * - a membership row is one per user and school, so an admin there is never
 *   also a parent there (an admin at one school who is a parent at another
 *   isn't admin-capable at the other, so that school is unaffected);
 * - a super-admin is never treated as "just a parent", even where they have a
 *   parent membership: Postgres RLS (is_super_admin()) still hands their
 *   session every school's data, so parent pages would show admin-level data.
 */
export function decideSchoolAdminSession(input: {
  enabled: boolean;
  isSuperAdmin: boolean;
  membership: { role: string } | null;
  sessionIsGoogle: boolean;
}): AdminSessionDecision {
  return decideAdminSession({
    enabled: input.enabled,
    isAdminCapable: isAdminCapableIn(input.isSuperAdmin, input.membership),
    sessionIsGoogle: input.sessionIsGoogle,
    hasParentFallback: false,
  });
}

/** True when the account has admin powers in this school (or everywhere). */
export function isAdminCapableIn(
  isSuperAdmin: boolean,
  membership: { role: string } | null | undefined
): boolean {
  return isSuperAdmin || membership?.role === "admin";
}

// ─── Session id ─────────────────────────────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The `session_id` and `sub` claims of a Supabase access token. Decodes
 * without verifying: only call it on a token Supabase just issued (sign-in
 * responses) or one getUser() has already accepted.
 */
export function accessTokenSession(
  accessToken: string | null | undefined
): { sessionId: string; userId: string } | null {
  const payload = accessToken?.split(".")[1];
  if (!payload) return null;
  try {
    // atob, not Buffer: middleware runs on the edge runtime.
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="))) as {
      session_id?: unknown;
      sub?: unknown;
    };
    if (typeof claims.session_id !== "string" || !UUID.test(claims.session_id)) return null;
    if (typeof claims.sub !== "string" || !UUID.test(claims.sub)) return null;
    return { sessionId: claims.session_id.toLowerCase(), userId: claims.sub.toLowerCase() };
  } catch {
    return null;
  }
}

export function sessionIdFromAccessToken(accessToken: string | null | undefined): string | null {
  return accessTokenSession(accessToken)?.sessionId ?? null;
}
