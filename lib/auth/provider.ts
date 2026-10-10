// Which system a school's parents sign in with. Client-safe (no secrets, no
// server imports) so the login UI and the native bridge can use it too.
//
// Stored per school in schools.auth_provider (migration 034). Anything other
// than "veracross" — including the column not existing yet because 034
// hasn't been applied — means Blackbaud, so existing schools are unaffected.

export type AuthProvider = "blackbaud" | "veracross";

interface ProviderInfo {
  /** Product name parents recognise, e.g. on the sign-in button. */
  label: string;
  /** What parents call the place they normally log in. */
  portalName: string;
  /** Route that starts this provider's sign-in. */
  startPath: string;
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
};

export function resolveAuthProvider(value: unknown): AuthProvider {
  return value === "veracross" ? "veracross" : "blackbaud";
}

/** Where a parent's "Sign in with …" link points. */
export function parentSignInHref(provider: AuthProvider, schoolSlug: string): string {
  return `${AUTH_PROVIDERS[provider].startPath}?school=${encodeURIComponent(schoolSlug)}`;
}

/** The provider whose sign-in starts at `pathname`, if any. */
export function providerForStartPath(pathname: string): AuthProvider | null {
  for (const [provider, info] of Object.entries(AUTH_PROVIDERS)) {
    if (info.startPath === pathname) return provider as AuthProvider;
  }
  return null;
}
