// Which system a school's parents sign in with. Client-safe (no secrets, no
// server imports) so the login UI and the native bridge can use it too.
//
// Stored per school in schools.auth_provider (migration 034; "roster" needs
// 044). Anything other than "veracross" or "roster" — including the column
// not existing yet because 034 hasn't been applied — means Blackbaud, so
// existing schools are unaffected.

export type AuthProvider = "blackbaud" | "veracross" | "roster";

interface ProviderInfo {
  /** Product name parents recognise, e.g. on the sign-in button. */
  label: string;
  /** What parents call the place they normally log in. */
  portalName: string;
  /**
   * Route that starts this provider's sign-in, or null when sign-in happens
   * on the school's own login page (roster: emailed code). The native app
   * opens start paths in the system sign-in sheet, so a provider that never
   * leaves askmyschool.app must not have one.
   */
  startPath: string | null;
}

export const AUTH_PROVIDERS: Record<AuthProvider, ProviderInfo> = {
  blackbaud: {
    label: "Blackbaud",
    portalName: "Blackbaud parent portal",
    startPath: "/auth/blackbaud",
  },
  veracross: {
    label: "Veracross",
    portalName: "Veracross portal",
    startPath: "/auth/veracross",
  },
  // Parents on the school's uploaded roster get a one-time code by email
  // (actions/roster-sign-in.ts). See docs/ROSTER_SIGN_IN.md.
  roster: {
    label: "email",
    portalName: "email address on file with the school",
    startPath: null,
  },
};

export function resolveAuthProvider(value: unknown): AuthProvider {
  return value === "veracross" || value === "roster" ? value : "blackbaud";
}

/** Where a parent's "Sign in with …" link points. */
export function parentSignInHref(provider: AuthProvider, schoolSlug: string): string {
  const { startPath } = AUTH_PROVIDERS[provider];
  return startPath
    ? `${startPath}?school=${encodeURIComponent(schoolSlug)}`
    : `/s/${encodeURIComponent(schoolSlug)}/login`;
}

/** The provider whose sign-in starts at `pathname`, if any. */
export function providerForStartPath(pathname: string): AuthProvider | null {
  for (const [provider, info] of Object.entries(AUTH_PROVIDERS)) {
    if (info.startPath !== null && info.startPath === pathname) {
      return provider as AuthProvider;
    }
  }
  return null;
}
