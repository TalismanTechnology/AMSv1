import { NextResponse } from "next/server";
import { getSchoolBySlug } from "@/lib/school-context";
import { resolveAuthProvider } from "@/lib/auth/provider";
import { isValidAppChallenge } from "@/lib/auth/app-handoff";
import {
  OAUTH_STATE_MAX_AGE_SECONDS,
  VERACROSS_LOGIN_STATE_COOKIE,
} from "@/lib/blackbaud/state";
import { getVeracrossConnection } from "@/lib/veracross/connection";
import { logVeracrossFailure } from "@/lib/veracross/log";
import { buildVeracrossStart } from "@/lib/veracross/sign-in";

// Starts "Sign in with Veracross" for a parent.
//
//   GET /auth/veracross?school=<slug>[&app_challenge=<S256>]
//
// Mirrors /auth/blackbaud: a signed state (which school) goes to Veracross,
// and the state + PKCE verifier stay behind in an httpOnly cookie. The
// authorize URL is the school's own (accounts.veracross.com/<route>), with
// the school's own OAuth Application client id.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const slug = searchParams.get("school")?.trim().toLowerCase();
  const rawAppChallenge = searchParams.get("app_challenge");
  const appChallenge = isValidAppChallenge(rawAppChallenge) ? rawAppChallenge : undefined;

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

  // A Blackbaud school's parents must never be sent through Veracross.
  if (resolveAuthProvider(school.auth_provider) !== "veracross") {
    return NextResponse.redirect(loginUrl);
  }

  const connection = await getVeracrossConnection(school.id);

  if (!connection) {
    logVeracrossFailure({ step: "authorize", schoolId: school.id, reason: "no enabled connection" });
    return NextResponse.redirect(
      `${loginUrl}?error=${encodeURIComponent(
        `${school.name} hasn't turned on Veracross sign-in yet. Please check back soon.`
      )}`
    );
  }

  let authorizeUrl: string;
  let cookieValue: string;

  try {
    ({ authorizeUrl, cookieValue } = buildVeracrossStart({
      connection,
      schoolId: school.id,
      schoolSlug: school.slug,
      appChallenge,
      origin,
    }));
  } catch (caught: unknown) {
    logVeracrossFailure({
      step: "authorize",
      schoolId: school.id,
      route: connection.schoolRoute,
      error: caught,
    });
    return NextResponse.redirect(
      `${loginUrl}?error=${encodeURIComponent("Sign-in is temporarily unavailable. Please try again later.")}`
    );
  }

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(VERACROSS_LOGIN_STATE_COOKIE, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // Lax: the callback is a top-level redirect back from Veracross.
    sameSite: "lax",
    path: "/auth/veracross",
    maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
  });

  return response;
}
