import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { appCallbackUrl, isValidAppChallenge } from "@/lib/auth/app-handoff";
import {
  GOOGLE_INTENT_COOKIE,
  GOOGLE_INTENT_MAX_AGE_SECONDS,
  GOOGLE_MESSAGES,
  isGoogleSignInEnabled,
  loginPathFor,
  packGoogleIntent,
  safeNextPath,
  withError,
} from "@/lib/auth/google-sign-in";

// Starts "Continue with Google" for staff and the super-admin
// (lib/auth/google-sign-in.ts).
//
//   GET /auth/google[?next=<path>][&app_challenge=<S256>]
//
// Asks Supabase for the Google authorize URL. @supabase/ssr runs the PKCE
// flow, so the code verifier is left behind in a cookie for
// app/auth/callback to redeem. `next` and the native app's challenge also
// ride along in a short-lived cookie, so they survive even if Supabase drops
// the redirect URL's query (it falls back to the Site URL when redirectTo
// isn't on its allowlist; middleware forwards that to the callback).
//
// Does nothing unless GOOGLE_SIGNIN_ENABLED is "true".
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const next = safeNextPath(searchParams.get("next"));
  const rawAppChallenge = searchParams.get("app_challenge");
  const appChallenge = isValidAppChallenge(rawAppChallenge) ? rawAppChallenge : null;

  const fail = (message: string) =>
    NextResponse.redirect(
      appChallenge
        ? appCallbackUrl({ error: message })
        : `${origin}${withError(loginPathFor(next), message)}`
    );

  if (!isGoogleSignInEnabled()) return fail(GOOGLE_MESSAGES.disabled);

  const redirectTo = new URL("/auth/callback", origin);
  if (next) redirectTo.searchParams.set("next", next);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: redirectTo.toString(),
      // Always show Google's account picker, so a shared computer signed in
      // to someone else's Google account doesn't sign in as them silently.
      queryParams: { prompt: "select_account" },
      skipBrowserRedirect: true,
    },
  });

  if (error || !data.url) {
    console.error(`Google sign-in could not start: ${error?.message ?? "no URL"}`);
    return fail(GOOGLE_MESSAGES.failed);
  }

  const response = NextResponse.redirect(data.url);
  response.cookies.set(GOOGLE_INTENT_COOKIE, packGoogleIntent({ next, appChallenge }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // Lax: the callback is a top-level redirect back from Google.
    sameSite: "lax",
    // "/" rather than /auth: the Site URL fallback lands on "/".
    path: "/",
    maxAge: GOOGLE_INTENT_MAX_AGE_SECONDS,
  });
  return response;
}
