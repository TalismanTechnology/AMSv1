// Which system a school's parents sign in with. Client-safe (no secrets, no
// server imports) so the login UI and the native bridge can use it too.
//
// Stored per school in schools.auth_provider (migration 034). Anything other
// than "veracross" or "roster" — including the column not existing yet
// because 034 hasn't been applied — means Blackbaud, so existing schools are
// unaffected.
//
// "roster" was the emailed one-time-code sign-in, which has been removed. The
// database constraint still allows the value, so it is read as a retired
// provider: no sign-in is offered and parents are told to contact the school.
// It can't be chosen in admin settings (SELECTABLE_AUTH_PROVIDERS).

export type AuthProvider = "blackbaud" | "veracross" | "roster";

/** Providers a super admin can choose and parents can actually sign in with. */
export const SELECTABLE_AUTH_PROVIDERS = ["blackbaud", "veracross"] as const;
export type SelectableAuthProvider = (typeof SELECTABLE_AUTH_PROVIDERS)[number];

export function isSelectableAuthProvider(value: unknown): value is SelectableAuthProvider {
  return (SELECTABLE_AUTH_PROVIDERS as readonly unknown[]).includes(value);
}

/** A leftover schools.auth_provider value that no longer has a sign-in. */
export function isRetiredAuthProvider(provider: AuthProvider): boolean {
  return !isSelectableAuthProvider(provider);
}

interface ProviderInfo {
  /** Product name parents recognise, e.g. on the sign-in button. */
  label: string;
  /** What parents call the place they normally log in. */
  portalName: string;
  /**
   * Route that starts this provider's sign-in, or null when there is none
   * (the retired roster provider). The native app opens start paths in the
   * system sign-in sheet.
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
  // Retired (emailed code sign-in was removed). Kept so a leftover database
  // value resolves to something safe; the login page offers no sign-in for it.
  roster: {
    label: "school",
    portalName: "school",
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
