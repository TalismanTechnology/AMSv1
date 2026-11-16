import type { NativePlatform } from "./platform";
import { createVerifier, openAndroidTab, openIosSheet, postForm } from "./blackbaud-sign-in";

// Staff "Continue with Google" inside the app. Google refuses to sign in
// inside embedded web views (disallowed_useragent), so, like Blackbaud, it
// runs in the system sign-in sheet (the AuthSession plugin on iOS, a Custom
// Tab on Android) and the session comes back through /auth/app-handoff. The
// server half is app/auth/google and app/auth/callback.

const FAILED = "We couldn't sign you in with Google. Please try again.";

function showLoginError(loginPath: string, message: string): void {
  window.location.assign(`${loginPath}?error=${encodeURIComponent(message)}`);
}

/**
 * Resolves once the sheet is closed without signing in (the page stays put);
 * otherwise navigates away.
 */
export async function signInWithGoogleInApp(
  platform: NativePlatform,
  options: { next: string | null; loginPath: string }
): Promise<void> {
  const { verifier, challenge } = await createVerifier();
  const startUrl = new URL("/auth/google", window.location.origin);
  if (options.next) startUrl.searchParams.set("next", options.next);
  startUrl.searchParams.set("app_challenge", challenge);

  let callbackUrl: string | null;
  try {
    callbackUrl =
      platform === "ios"
        ? await openIosSheet(startUrl.toString())
        : await openAndroidTab(startUrl.toString());
  } catch (caught: unknown) {
    console.error("[native] Google sign-in sheet failed", caught);
    showLoginError(options.loginPath, "We couldn't open Google sign-in. Please try again.");
    return;
  }

  // Closed the sheet: stay where they were.
  if (!callbackUrl) return;

  const params = new URL(callbackUrl).searchParams;
  const error = params.get("error");
  const code = params.get("code");

  if (error || !code) {
    showLoginError(options.loginPath, error ?? FAILED);
    return;
  }

  postForm("/auth/app-handoff", { code, verifier });
}
