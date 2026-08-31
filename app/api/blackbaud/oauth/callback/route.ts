import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCodeForConnection } from "@/lib/blackbaud/oauth";
import { OAUTH_STATE_COOKIE, verifyOAuthState } from "@/lib/blackbaud/state";

// Blackbaud redirects the admin's browser here after they approve (or decline).
//
//   GET /api/blackbaud/oauth/callback?code=...&state=...
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);

  const error = searchParams.get("error");
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const cookieStore = await cookies();
  const cookieState = cookieStore.get(OAUTH_STATE_COOKIE)?.value;

  // Signature proves we minted this state; the cookie proves it came back to
  // the browser we minted it for. Both are required — a valid signature alone
  // lets someone replay their own state against a consent phished from an
  // unrelated Blackbaud org, binding that org's tokens to their school.
  const verified = state ? verifyOAuthState(state, cookieState) : null;

  if (!verified) {
    return NextResponse.json(
      { error: "Invalid or expired authorization state" },
      { status: 400 }
    );
  }

  const settingsUrl = `${origin}/s/${verified.schoolSlug}/admin/settings`;

  // Single-use: consumed here so a captured state can't be replayed inside its
  // TTL window, even from the original browser.
  const clearState = (response: NextResponse) => {
    response.cookies.delete({ name: OAUTH_STATE_COOKIE, path: "/api/blackbaud" });
    return response;
  };

  // Admin declined consent, or Blackbaud rejected the request.
  if (error) {
    return clearState(NextResponse.redirect(`${settingsUrl}?blackbaud=denied`));
  }

  if (!code) {
    return clearState(NextResponse.redirect(`${settingsUrl}?blackbaud=error`));
  }

  try {
    await exchangeCodeForConnection(verified.schoolId, code);
  } catch (caught: unknown) {
    const message =
      caught instanceof Error ? caught.message : "Unknown connection failure";
    console.error(
      `Blackbaud connect failed for school ${verified.schoolId}: ${message}`
    );
    return clearState(NextResponse.redirect(`${settingsUrl}?blackbaud=error`));
  }

  return clearState(
    NextResponse.redirect(`${settingsUrl}?blackbaud=connected`)
  );
}
