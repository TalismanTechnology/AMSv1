// Pure URL decisions for the iOS / Android app, kept free of Capacitor and
// the DOM so they can be unit tested (links.test.ts).

/**
 * Hosts the app shows inside its own web view. Keep in step with
 * server.allowNavigation in capacitor.config.ts and the applinks: entitlement
 * in ios/App/App/App.entitlements.
 */
export const APP_HOSTS = ["askmyschool.app"];

/** The custom scheme the app registers (Info.plist / AndroidManifest.xml). */
export const APP_SCHEME = "app.askmyschool";

/**
 * Should a tapped link open in the in-app browser (SFSafariViewController /
 * Custom Tab) rather than navigate the app's web view?
 *
 * Only http(s) links to some other site. Same-site links stay in the app,
 * and mailto:, tel:, sms: and friends are left to the system.
 */
export function opensInAppBrowser(href: string, currentOrigin: string): boolean {
  let url: URL;
  try {
    url = new URL(href, currentOrigin);
  } catch {
    return false;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.origin === currentOrigin) return false;
  return !APP_HOSTS.includes(url.hostname);
}

/** A same-site path with no protocol-relative trick (`//evil.com`). */
function safePath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return null;
  }
  return value;
}

/**
 * The in-app path a deep link should open, or null when the URL isn't one of
 * ours. Accepts
 *
 *   https://askmyschool.app/s/collegiate/parent/announcements   (universal link)
 *   app.askmyschool://open?path=/s/collegiate/parent             (custom scheme)
 *
 * The sign-in callback (app.askmyschool://auth-callback) is handled by the
 * sign-in flow itself, never here.
 */
export function deepLinkPath(link: string): string | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }

  if (url.protocol === "https:" && APP_HOSTS.includes(url.hostname)) {
    // Sign-in and API routes are never deep-link targets.
    if (url.pathname.startsWith("/auth/") || url.pathname.startsWith("/api/")) return null;
    return safePath(`${url.pathname}${url.search}${url.hash}`);
  }

  if (url.protocol === `${APP_SCHEME}:` && url.hostname === "open") {
    const path = safePath(url.searchParams.get("path"));
    if (!path || path.startsWith("/auth/") || path.startsWith("/api/")) return null;
    return path;
  }

  return null;
}
