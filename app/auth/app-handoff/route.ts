import { NextResponse } from "next/server";
import { redeemAppHandoff } from "@/lib/auth/app-handoff";
import { startParentSession } from "@/lib/auth/parent-session";

// The native app's half of Blackbaud sign-in (see lib/auth/app-handoff.ts).
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

    await startParentSession(handoff.email);

    // Middleware sends first-time parents on to /welcome from here.
    return NextResponse.redirect(`${origin}/s/${handoff.schoolSlug}/parent`, 303);
  } catch (caught: unknown) {
    const message = caught instanceof Error ? caught.message : "Unknown error";
    console.error(`App sign-in handoff failed: ${message}`);
    return toLogin(`${origin}/login?error=${encodeURIComponent(FAILED)}`);
  }
}
