import type { PluginListenerHandle } from "@capacitor/core";
import type { NativePlatform } from "./platform";
import { AUTH_PROVIDERS, type AuthProvider } from "@/lib/auth/provider";

// "Sign in with Blackbaud" (or Veracross) inside the app. The server half and the reasoning
// are in lib/auth/app-handoff.ts; this is the part that runs in the web view.

const APP_CALLBACK_URL = "app.askmyschool://auth-callback";
const CALLBACK_SCHEME = "app.askmyschool";

// How long to wait after Android's browser closes for the deep link that
// usually closes it, before treating the close as "the parent cancelled".
const ANDROID_CANCEL_GRACE_MS = 800;

interface AuthSessionPlugin {
  start(options: { url: string; callbackScheme: string }): Promise<{ url: string }>;
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function createVerifier(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

/** iOS: ASWebAuthenticationSession, via the app's own AuthSession plugin. */
async function openIosSheet(url: string): Promise<string | null> {
  const { registerPlugin } = await import("@capacitor/core");
  const authSession = registerPlugin<AuthSessionPlugin>("AuthSession");

  try {
    const result = await authSession.start({ url, callbackScheme: CALLBACK_SCHEME });
    return result.url;
  } catch (caught: unknown) {
    if ((caught as { code?: string })?.code === "CANCELLED") return null;
    throw caught;
  }
}

/** Android: a Custom Tab, closed when the app.askmyschool:// link comes back. */
async function openAndroidTab(url: string): Promise<string | null> {
  const [{ App }, { Browser }] = await Promise.all([
    import("@capacitor/app"),
    import("@capacitor/browser"),
  ]);

  return new Promise<string | null>((resolve, reject) => {
    const handles: PluginListenerHandle[] = [];
    let settled = false;

    const settle = (value: string | null) => {
      if (settled) return;
      settled = true;
      handles.forEach((handle) => void handle.remove());
      resolve(value);
    };

    void (async () => {
      handles.push(
        await App.addListener("appUrlOpen", ({ url: openedUrl }) => {
          if (!openedUrl.startsWith(APP_CALLBACK_URL)) return;
          void Browser.close().catch(() => undefined);
          settle(openedUrl);
        }),
        await Browser.addListener("browserFinished", () => {
          setTimeout(() => settle(null), ANDROID_CANCEL_GRACE_MS);
        })
      );

      try {
        await Browser.open({ url });
      } catch (caught: unknown) {
        settled = true;
        handles.forEach((handle) => void handle.remove());
        reject(caught);
      }
    })();
  });
}

/** Navigates with a POST so the verifier travels in the body, not the URL. */
function postForm(action: string, fields: Record<string, string>): void {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = action;
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

function showLoginError(schoolSlug: string, message: string): void {
  window.location.assign(
    `/s/${encodeURIComponent(schoolSlug)}/login?error=${encodeURIComponent(message)}`
  );
}

export async function signInWithSchoolProvider(
  platform: NativePlatform,
  schoolSlug: string,
  provider: AuthProvider = "blackbaud"
): Promise<void> {
  const { label, startPath } = AUTH_PROVIDERS[provider];
  const { verifier, challenge } = await createVerifier();
  const startUrl =
    `${window.location.origin}${startPath}?school=${encodeURIComponent(schoolSlug)}` +
    `&app_challenge=${challenge}`;

  let callbackUrl: string | null;
  try {
    callbackUrl =
      platform === "ios" ? await openIosSheet(startUrl) : await openAndroidTab(startUrl);
  } catch (caught: unknown) {
    console.error(`[native] ${label} sign-in sheet failed`, caught);
    showLoginError(schoolSlug, `We couldn't open ${label} sign-in. Please try again.`);
    return;
  }

  // The parent closed the sheet: stay where they were.
  if (!callbackUrl) return;

  const params = new URL(callbackUrl).searchParams;
  const error = params.get("error");
  const code = params.get("code");

  if (error || !code) {
    showLoginError(
      params.get("school") ?? schoolSlug,
      error ?? `We couldn't sign you in with ${label}. Please try again.`
    );
    return;
  }

  postForm("/auth/app-handoff", { code, verifier });
}
