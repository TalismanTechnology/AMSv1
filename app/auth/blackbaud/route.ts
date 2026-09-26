import { NextResponse } from "next/server";
import { getSchoolBySlug } from "@/lib/school-context";
import { getSchoolEnvironmentId } from "@/lib/auth/sign-in-schools";
import {
  buildParentAuthorizeUrl,
  createPkcePair,
  getParentRedirectUri,
} from "@/lib/blackbaud/parent-login";
import {
  LOGIN_STATE_COOKIE,
  OAUTH_STATE_MAX_AGE_SECONDS,
  createLoginState,
  packLoginCookie,
} from "@/lib/blackbaud/state";

// Starts "Sign in with Blackbaud" for a parent.
//
//   GET /auth/blackbaud?school=<slug>
//
// Sends the browser to Blackbaud with a signed state (which school) and a PKCE
// challenge. The matching verifier stays behind in an httpOnly cookie.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const slug = searchParams.get("school")?.trim().toLowerCase();

  if (!slug) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const school = await getSchoolBySlug(slug);

  if (!school) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("We couldn't find that school.")}`
    );
  }

  const loginUrl = `${origin}/s/${school.slug}/login`;
  const environmentId = await getSchoolEnvironmentId(school.id);

  if (!environmentId) {
    return NextResponse.redirect(
      `${loginUrl}?error=${encodeURIComponent(
        `${school.name} hasn't turned on Blackbaud sign-in yet. Please check back soon.`
      )}`
    );
  }

  let authorizeUrl: string;
  let cookieValue: string;

  try {
    const state = createLoginState(school.id, school.slug);
    const pkce = createPkcePair();
    authorizeUrl = buildParentAuthorizeUrl(
      state,
      pkce.challenge,
      getParentRedirectUri(origin)
    );
    cookieValue = packLoginCookie(state, pkce.verifier);
  } catch (caught: unknown) {
    const message = caught instanceof Error ? caught.message : "Unknown error";
    console.error(`Blackbaud sign-in could not start: ${message}`);
    return NextResponse.redirect(
      `${loginUrl}?error=${encodeURIComponent("Sign-in is temporarily unavailable. Please try again later.")}`
    );
  }

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(LOGIN_STATE_COOKIE, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // Lax, not Strict: the callback is a top-level redirect back from
    // Blackbaud, which Strict would strip the cookie from.
    sameSite: "lax",
    path: "/auth/blackbaud",
    maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
  });

  return response;
}
