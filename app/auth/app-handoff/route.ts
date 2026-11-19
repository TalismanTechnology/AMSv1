import { NextResponse } from "next/server";
import { redeemAppHandoff } from "@/lib/auth/app-handoff";
import { startParentSession, startStaffSession } from "@/lib/auth/parent-session";
import { loadStaffAccess } from "@/lib/auth/google-access";
import { recordGoogleSession } from "@/lib/auth/admin-session";
import {
  decideGoogleAccess,
  loginPathFor,
  parseGoogleHandoffSlug,
  withError,
} from "@/lib/auth/google-sign-in";

// The native app's half of Blackbaud sign-in (see lib/auth/app-handoff.ts),
// and of "Continue with Google" (lib/auth/google-sign-in.ts) for staff and
// existing parents.
//
//   POST /auth/app-handoff   form: code, verifier
//
// Posted from the app's web view once the sign-in sheet returns a code. The
// verifier is sent in the body, not the URL, so it stays out of request logs.

const FAILED = "We couldn't finish signing you in. Please try again.";

export async function POST(request: Request) {
  const { origin } = new URL(request.url);

  // Only the site itself may post here. Without this, another page could post
  // an attacker's own code and sign a visitor in as the attacker.
  if (request.headers.get("origin") !== origin) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const form = await request.formData();
  const code = form.get("code");
  const verifier = form.get("verifier");

  const toLogin = (url: string) => NextResponse.redirect(url, 303);

  if (typeof code !== "string" || typeof verifier !== "string" || !code || !verifier) {
    return toLogin(`${origin}/login?error=${encodeURIComponent(FAILED)}`);
  }

  try {
    const handoff = await redeemAppHandoff(code, verifier);

    if (!handoff) {
      return toLogin(`${origin}/login?error=${encodeURIComponent(FAILED)}`);
    }

    const google = parseGoogleHandoffSlug(handoff.schoolSlug);
    if (google) {
      // Signed in with Google in the sign-in sheet. The callback already
      // checked their verified Google email moments ago; their access (admin,
      // or an approved parent membership) is checked again here, right before
      // the session starts. A parent's handoff carries their school, so the
      // decision lands them on its parent chat.
      const next = google.schoolSlug ? `/s/${google.schoolSlug}/admin` : null;
      const outcome: { destination?: string; refusal: string } = { refusal: FAILED };
      const started = await startStaffSession(handoff.email, async (user) => {
        const decision = decideGoogleAccess({
          emailVerified: true,
          access: await loadStaffAccess(user.id),
          next,
        });
        if (!decision.allowed) {
          outcome.refusal = decision.message;
          return false;
        }
        outcome.destination = decision.destination;
        return true;
      });
      if (!started || !outcome.destination) {
        return toLogin(`${origin}${withError(loginPathFor(next), outcome.refusal)}`);
      }
      // Mark it as a Google session (ADMIN_GOOGLE_ONLY). Its amr says "otp",
      // like a parent's Blackbaud / Veracross session, so this row is the only record that Google
      // started it. On failure the sign-in still goes ahead; admin access then
      // asks for Google sign-in again.
      await recordGoogleSession({
        accessToken: started.access_token,
        userId: started.user.id,
        via: "app",
      });
      return NextResponse.redirect(`${origin}${outcome.destination}`, 303);
    }

    await startParentSession(handoff.email);

    // Middleware sends first-time parents on to /welcome from here.
    return NextResponse.redirect(`${origin}/s/${handoff.schoolSlug}/parent/chat`, 303);
  } catch (caught: unknown) {
    const message = caught instanceof Error ? caught.message : "Unknown error";
    console.error(`App sign-in handoff failed: ${message}`);
    return toLogin(`${origin}/login?error=${encodeURIComponent(FAILED)}`);
  }
}
