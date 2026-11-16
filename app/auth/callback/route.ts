import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { appCallbackUrl, createGoogleAppHandoff } from "@/lib/auth/app-handoff";
import { loadStaffAccess } from "@/lib/auth/google-access";
import { recordGoogleSession } from "@/lib/auth/admin-session";
import {
  GOOGLE_INTENT_COOKIE,
  GOOGLE_MESSAGES,
  decideGoogleAccess,
  hasVerifiedGoogleEmail,
  isNoAccountError,
  loginPathFor,
  safeNextPath,
  unpackGoogleIntent,
  withError,
} from "@/lib/auth/google-sign-in";

// Where Supabase sends the browser back after "Continue with Google"
// (started by app/auth/google/route.ts; see lib/auth/google-sign-in.ts).
//
//   GET /auth/callback?code=…[&next=<path>]
//   GET /auth/callback?error=…&error_description=…
//
// Redeems the PKCE code for a session (cookies are written by the shared
// server client), then decides server-side whether this person may be here at
// all. Only an existing super-admin or school admin whose Google email is
// verified keeps the session; anyone else is signed straight back out.
// Supabase links the Google identity to an existing account with the same
// verified email by itself, and with sign-ups off it never creates one.
//
// Works whether or not GOOGLE_SIGNIN_ENABLED is on: without the start route
// nobody gets here with a code, and the access check still applies.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const intent = unpackGoogleIntent(request.cookies.get(GOOGLE_INTENT_COOKIE)?.value);
  const next = safeNextPath(searchParams.get("next")) ?? intent?.next ?? null;
  const appChallenge = intent?.appChallenge ?? null;

  // Single-use: cleared on every outcome.
  const finish = (url: string) => {
    const response = NextResponse.redirect(url);
    response.cookies.delete({ name: GOOGLE_INTENT_COOKIE, path: "/" });
    return response;
  };
  // Started from the native app: every outcome goes back to the app, which
  // closes the sign-in sheet and shows it there.
  const refuse = (message: string) =>
    finish(
      appChallenge
        ? appCallbackUrl({ error: message })
        : `${origin}${withError(loginPathFor(next), message)}`
    );

  if (searchParams.get("error") || searchParams.get("error_description")) {
    if (isNoAccountError(searchParams)) return refuse(GOOGLE_MESSAGES.noAccount);
    console.error(
      `Google sign-in returned an error: ${searchParams.get("error_code") ?? searchParams.get("error")}`
    );
    return refuse(GOOGLE_MESSAGES.failed);
  }

  const code = searchParams.get("code");
  if (!code) return refuse(GOOGLE_MESSAGES.failed);

  const supabase = await createClient();
  const { data: exchanged, error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    console.error(`Google sign-in code exchange failed: ${exchangeError.message}`);
    return refuse(GOOGLE_MESSAGES.failed);
  }

  // Fresh from Auth, identities included.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const signOutAndRefuse = async (message: string) => {
    await supabase.auth.signOut({ scope: "local" });
    return refuse(message);
  };

  if (!user?.email) return signOutAndRefuse(GOOGLE_MESSAGES.failed);

  let decision;
  try {
    decision = decideGoogleAccess({
      emailVerified: hasVerifiedGoogleEmail(user),
      access: await loadStaffAccess(user.id),
      next,
    });
  } catch (caught: unknown) {
    console.error(
      `Google sign-in access check failed: ${caught instanceof Error ? caught.message : caught}`
    );
    return signOutAndRefuse(GOOGLE_MESSAGES.failed);
  }

  if (!decision.allowed) return signOutAndRefuse(decision.message);

  if (appChallenge) {
    // The session belongs in the app's web view, not this sign-in sheet: hand
    // it over (lib/auth/app-handoff.ts) and leave nothing behind here.
    try {
      const handoffCode = await createGoogleAppHandoff({
        email: user.email,
        schoolSlug: decision.schoolSlug,
        appChallenge,
      });
      await supabase.auth.signOut({ scope: "local" });
      return finish(appCallbackUrl({ code: handoffCode }));
    } catch (caught: unknown) {
      console.error(
        `Google sign-in app handoff failed: ${caught instanceof Error ? caught.message : caught}`
      );
      return signOutAndRefuse(GOOGLE_MESSAGES.failed);
    }
  }

  // Mark this session as a Google one (ADMIN_GOOGLE_ONLY), from the token the
  // exchange just returned. On failure the sign-in still goes ahead; admin
  // access then asks for Google sign-in again. (The app path above signs this
  // session out; /auth/app-handoff records the app's own session.)
  await recordGoogleSession({
    accessToken: exchanged.session?.access_token,
    userId: user.id,
    via: "web",
  });

  return finish(`${origin}${decision.destination}`);
}
