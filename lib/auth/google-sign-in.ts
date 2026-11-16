// "Continue with Google" for school staff and the super-admin.
//
// Google only proves who someone is. Supabase Auth's Google provider does the
// OAuth dance (PKCE, via @supabase/ssr), and the project has sign-ups turned
// off, so Supabase never creates an account here: an unknown Google email
// comes back with a "Signups not allowed" error. When the Google email
// matches an existing account and Google says it's verified, Supabase links
// the Google identity to that account by itself; nothing here links
// identities by hand.
//
// A linked identity still isn't enough to get in. After the code exchange the
// callback (app/auth/callback/route.ts) runs decideGoogleAccess: only a
// super-admin or an admin of a school gets a session. Everyone else (parents,
// accounts with no role) is signed straight back out. Nothing here creates a
// profile or a membership or grants a role.
//
// Everything in this file is pure so it can be unit tested; the parts that
// talk to Supabase are in google-access.ts and the route handlers.

/** Server-side feature flag. Off unless set to exactly "true". */
export const GOOGLE_SIGNIN_FLAG = "GOOGLE_SIGNIN_ENABLED";

export function isGoogleSignInEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env[GOOGLE_SIGNIN_FLAG]?.trim().toLowerCase() === "true";
}

/** Short-lived cookie carrying `next` and the native app's challenge through Google. */
export const GOOGLE_INTENT_COOKIE = "ams_google_signin";
export const GOOGLE_INTENT_MAX_AGE_SECONDS = 10 * 60;

export const GOOGLE_MESSAGES = {
  noAccount:
    "No AskMySchool admin account uses this Google email. Sign in with your password or ask your school admin to add you.",
  notThisSchool:
    "Your Google account isn't a staff member at this school. Sign in with your password or ask your school admin to add you.",
  unverified:
    "Google hasn't verified this email address, so it can't be used to sign in. Sign in with your password instead.",
  failed: "We couldn't sign you in with Google. Please try again.",
  disabled: "Google sign-in isn't available right now. Please sign in with your password.",
  passwordDisabled: "This account signs in with Google.",
} as const;

// ─── Redirect target ────────────────────────────────────────────────────

/**
 * `next` as a same-origin path, or null. Only "/x…" paths: no scheme, no
 * host, no protocol-relative "//evil.com" or "/\evil.com" (browsers treat
 * the backslash as a slash), no control characters, and never back into the
 * auth routes themselves.
 */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value.startsWith("/") || value.length > 512) return null;
  if (value.startsWith("//") || value.includes("\\")) return null;
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;

  let url: URL;
  try {
    url = new URL(value, "https://askmyschool.invalid");
  } catch {
    return null;
  }
  if (url.origin !== "https://askmyschool.invalid") return null;
  if (url.pathname.startsWith("/auth/")) return null;

  return `${url.pathname}${url.search}`;
}

/** The school a path belongs to (`/s/<slug>/…`), if any. */
export function schoolSlugFromPath(path: string | null): string | null {
  const match = path?.match(/^\/s\/([a-z0-9-]+)(?:[/?]|$)/);
  return match ? match[1] : null;
}

/** Where to send someone back to when Google sign-in is refused. */
export function loginPathFor(next: string | null): string {
  const slug = schoolSlugFromPath(next);
  return slug ? `/s/${slug}/login` : "/login/staff";
}

export function withError(path: string, message: string): string {
  return `${path}?error=${encodeURIComponent(message)}`;
}

// ─── Provider errors ────────────────────────────────────────────────────

/**
 * True when Supabase refused because no account uses this email. With sign-ups
 * off it redirects back with error=access_denied (or signup_disabled) and a
 * description like "Signups not allowed for this instance".
 */
export function isNoAccountError(params: URLSearchParams): boolean {
  const text = [params.get("error"), params.get("error_code"), params.get("error_description")]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /signups? not allowed|signup_disabled|user not found/.test(text);
}

// ─── Identity ───────────────────────────────────────────────────────────

interface IdentityLike {
  provider?: string;
  identity_data?: Record<string, unknown> | null;
}

export interface GoogleUserLike {
  email?: string | null;
  identities?: IdentityLike[] | null;
}

/**
 * True when the user has a Google identity whose email Google verified and
 * which is the account's own email. Supabase only links a verified email, but
 * this is the check access depends on, so it doesn't rely on that.
 */
export function hasVerifiedGoogleEmail(user: GoogleUserLike): boolean {
  const email = user.email?.trim().toLowerCase();
  if (!email) return false;

  return (user.identities ?? []).some((identity) => {
    if (identity.provider !== "google") return false;
    const data = identity.identity_data ?? {};
    const verified = data.email_verified === true || data.email_verified === "true";
    const identityEmail = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
    return verified && identityEmail === email;
  });
}

export function hasGoogleIdentity(user: GoogleUserLike): boolean {
  return (user.identities ?? []).some((identity) => identity.provider === "google");
}

// ─── Access decision ────────────────────────────────────────────────────

export interface StaffAccess {
  /** profiles.role */
  profileRole: string | null;
  /** Slugs of schools where the user has an `admin` membership. */
  adminSchoolSlugs: string[];
}

export type GoogleAccessDecision =
  | { allowed: true; destination: string; schoolSlug: string | null }
  | { allowed: false; message: string };

/**
 * Who gets a session after a Google sign-in, and where they land.
 *
 * - super-admin: allowed; `next` if given, else /super-admin. Inside a school
 *   the owner lock (lib/school-lock) still applies; this doesn't bypass it.
 * - school admin (an `admin` membership, the same rule as password sign-in):
 *   allowed into a school they administer. Coming from one school's login
 *   page, only that school.
 * - anyone else (parents, no profile): refused.
 */
export function decideGoogleAccess(input: {
  emailVerified: boolean;
  access: StaffAccess | null;
  next: string | null;
}): GoogleAccessDecision {
  if (!input.emailVerified) return { allowed: false, message: GOOGLE_MESSAGES.unverified };

  const access = input.access;
  const isSuperAdmin = access?.profileRole === "super_admin";
  const adminSlugs = access?.adminSchoolSlugs ?? [];
  const requestedSlug = schoolSlugFromPath(input.next);

  if (isSuperAdmin) {
    return {
      allowed: true,
      destination: requestedSlug ? adminPathIn(requestedSlug, input.next) : (input.next ?? "/super-admin"),
      schoolSlug: requestedSlug,
    };
  }

  if (adminSlugs.length === 0) return { allowed: false, message: GOOGLE_MESSAGES.noAccount };

  if (requestedSlug) {
    if (!adminSlugs.includes(requestedSlug)) {
      return { allowed: false, message: GOOGLE_MESSAGES.notThisSchool };
    }
    return {
      allowed: true,
      destination: adminPathIn(requestedSlug, input.next),
      schoolSlug: requestedSlug,
    };
  }

  const slug = adminSlugs[0];
  return { allowed: true, destination: `/s/${slug}/admin`, schoolSlug: slug };
}

/** `next` when it's already inside the school's admin area, else its admin home. */
function adminPathIn(slug: string, next: string | null): string {
  const adminRoot = `/s/${slug}/admin`;
  if (next && (next === adminRoot || next.startsWith(`${adminRoot}/`) || next.startsWith(`${adminRoot}?`))) {
    return next;
  }
  return adminRoot;
}

// ─── Native app handoff ─────────────────────────────────────────────────

// The app's sign-in sheet has its own cookies, so a Google sign-in started
// from the app is handed back through app_sign_in_handoffs like Blackbaud's
// (lib/auth/app-handoff.ts). That table's school_slug column tells the two
// apart: real slugs are [a-z0-9-], so a "google:" prefix can't collide. What
// follows the prefix is the school the staff member asked for (may be empty).
// The redeem step re-runs decideGoogleAccess; nothing is trusted from here.
const GOOGLE_HANDOFF_PREFIX = "google:";

export function googleHandoffSlug(schoolSlug: string | null): string {
  return `${GOOGLE_HANDOFF_PREFIX}${schoolSlug ?? ""}`;
}

/** For a Google handoff, `{ schoolSlug }` (null for none); for a parent handoff, null. */
export function parseGoogleHandoffSlug(value: string): { schoolSlug: string | null } | null {
  if (!value.startsWith(GOOGLE_HANDOFF_PREFIX)) return null;
  const slug = value.slice(GOOGLE_HANDOFF_PREFIX.length);
  return { schoolSlug: /^[a-z0-9-]+$/.test(slug) ? slug : null };
}

// ─── Require Google (password sign-in off) ──────────────────────────────

// Per-account switch kept in app_metadata, which only the service role can
// write: users can't flip it for themselves or anyone else, and it comes with
// every getUser() so enforcing it costs no extra query.
export const PASSWORD_SIGNIN_DISABLED_KEY = "password_signin_disabled";

export function isPasswordSignInDisabled(
  appMetadata: Record<string, unknown> | null | undefined
): boolean {
  return appMetadata?.[PASSWORD_SIGNIN_DISABLED_KEY] === true;
}

/**
 * The sign-in methods recorded in a Supabase access token's `amr` claim
 * ("password", "oauth", "otp", …). Decodes without verifying: only call it
 * on a token getUser() has already accepted.
 */
export function sessionAuthMethods(accessToken: string | null | undefined): string[] {
  const payload = accessToken?.split(".")[1];
  if (!payload) return [];
  try {
    // atob, not Buffer: middleware runs on the edge runtime.
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="))) as {
      amr?: { method?: unknown }[];
    };
    return (claims.amr ?? [])
      .map((entry) => entry?.method)
      .filter((method): method is string => typeof method === "string");
  } catch {
    return [];
  }
}

/**
 * True when this session came from a password but the account must use
 * Google. Only enforced while Google sign-in is on, so turning the flag off
 * is the escape hatch that brings password sign-in back.
 */
export function violatesPasswordPolicy(input: {
  googleEnabled: boolean;
  appMetadata: Record<string, unknown> | null | undefined;
  authMethods: string[];
}): boolean {
  return (
    input.googleEnabled &&
    isPasswordSignInDisabled(input.appMetadata) &&
    input.authMethods.includes("password")
  );
}

// ─── Intent cookie ──────────────────────────────────────────────────────

export interface GoogleIntent {
  next: string | null;
  appChallenge: string | null;
}

export function packGoogleIntent(intent: GoogleIntent): string {
  return new URLSearchParams({
    next: intent.next ?? "",
    app: intent.appChallenge ?? "",
  }).toString();
}

/** The intent cookie's contents, with `next` re-validated. Null if absent. */
export function unpackGoogleIntent(value: string | null | undefined): GoogleIntent | null {
  if (!value) return null;
  const params = new URLSearchParams(value);
  const app = params.get("app");
  return {
    next: safeNextPath(params.get("next")),
    appChallenge: app && /^[A-Za-z0-9_-]{43}$/.test(app) ? app : null,
  };
}
