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
 * Put on a link (`{...SYSTEM_BROWSER_LINK}`) to open it in the system browser
 * (Safari / the default Android browser) rather than the in-app browser.
 * On the website it changes nothing.
 *
 * native-shell.tsx leaves such links alone, so the tap navigates the web view
 * to a host that isn't in server.allowNavigation, and Capacitor hands it to
 * the OS instead of loading it:
 *
 * - iOS: WebViewDelegationHandler.webView(_:decidePolicyFor:decisionHandler:)
 *   cancels it and calls UIApplication.shared.open (Safari). A target="_blank"
 *   link arrives there first as a new-window action (targetFrame == nil); if
 *   it ever reached webView(_:createWebViewWith:…) that also calls
 *   UIApplication.shared.open.
 * - Android: BridgeWebViewClient.shouldOverrideUrlLoading → Bridge.launchIntent
 *   starts an ACTION_VIEW intent (the default browser). The web view doesn't
 *   support multiple windows, so target="_blank" loads through the same path.
 *
 * Both are stock Capacitor, so this works in builds already in the stores.
 * Used for "Search the web", which leads anywhere on the internet and so
 * mustn't open inside the app (App Store age rating).
 */
export const SYSTEM_BROWSER_ATTRIBUTE = "data-system-browser";
export const SYSTEM_BROWSER_LINK = { [SYSTEM_BROWSER_ATTRIBUTE]: "" } as const;

/**
 * Should a tapped link open in the in-app browser (SFSafariViewController /
 * Custom Tab) rather than navigate the app's web view?
 *
 * Only http(s) links to some other site, and not ones marked for the system
 * browser (SYSTEM_BROWSER_ATTRIBUTE). Same-site links stay in the app, and
 * mailto:, tel:, sms: and friends are left to the system.
 */
export function opensInAppBrowser(
  href: string,
  currentOrigin: string,
  systemBrowser = false
): boolean {
  if (systemBrowser) return false;

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
 *   https://askmyschool.app/s/collegiate/parent/events   (universal link)
 *   app.askmyschool://open?path=/s/collegiate/parent      (custom scheme)
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
