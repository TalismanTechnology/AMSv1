import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSchoolEnvironmentId } from "@/lib/auth/sign-in-schools";
import {
  ensureParentMembership,
  findOrCreateParentAccount,
  getStaffRole,
  revokeParentPassword,
  startParentSession,
} from "@/lib/auth/parent-session";
import {
  decideParentAccess,
  exchangeParentCode,
  fetchSchoolCaller,
  getParentRedirectUri,
  type ParentTokenResponse,
  type SchoolCaller,
} from "@/lib/blackbaud/parent-login";
import { normalizeEmail } from "@/lib/blackbaud/crypto";
import {
  LOGIN_STATE_COOKIE,
  unpackLoginCookie,
  verifyLoginState,
} from "@/lib/blackbaud/state";

// Blackbaud sends the parent's browser back here after they sign in.
//
//   GET /auth/blackbaud/callback?code=...&state=...
//
// Only people the school's own records mark as parents get through, and only
// when they signed in to this school's Blackbaud environment. Everyone else —
// staff, students, alumni, other schools — is sent back to the login page with
// no session created.

const MESSAGES = {
  cancelled: "Blackbaud sign-in was cancelled.",
  expired: "Your sign-in link expired. Please try again.",
  failed: "We couldn't sign you in with Blackbaud. Please try again.",
  wrongEnvironment:
    "That Blackbaud account belongs to a different school. Make sure you pick the right school.",
  notParent:
    "Only parents and guardians can sign in here, and your Blackbaud account isn't listed as one. If that's wrong, please contact your school office.",
  staff:
    "This is a staff account. Please use School staff sign-in instead.",
} as const;

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const cookieStore = await cookies();
  const packed = unpackLoginCookie(cookieStore.get(LOGIN_STATE_COOKIE)?.value);

  const state = searchParams.get("state");
  const verified =
    state && packed ? verifyLoginState(state, packed.state) : null;

  // Single-use: consumed on every outcome so a captured state can't be
  // replayed inside its TTL window.
  const finish = (url: string) => {
    const response = NextResponse.redirect(url);
    response.cookies.delete({ name: LOGIN_STATE_COOKIE, path: "/auth/blackbaud" });
    return response;
  };

  if (!verified || !packed) {
    return finish(`${origin}/login?error=${encodeURIComponent(MESSAGES.expired)}`);
  }

  const { schoolId, schoolSlug } = verified;
  const fail = (message: string) =>
    finish(`${origin}/s/${schoolSlug}/login?error=${encodeURIComponent(message)}`);

  const code = searchParams.get("code");

  if (searchParams.get("error") || !code) {
    return fail(MESSAGES.cancelled);
  }

  let token: ParentTokenResponse;
  let caller: SchoolCaller;

  try {
    token = await exchangeParentCode(code, packed.verifier, getParentRedirectUri(origin));
    caller = await fetchSchoolCaller(token.access_token);
  } catch (caught: unknown) {
    logFailure(schoolId, "identify caller", caught);
    return fail(MESSAGES.failed);
  }

  const decision = decideParentAccess({
    schoolEnvironmentId: await getSchoolEnvironmentId(schoolId),
    tokenEnvironmentId: token.environment_id,
    isParent: caller.isParent,
  });

  if (!decision.allowed) {
    return fail(
      decision.reason === "not_a_parent" ? MESSAGES.notParent : MESSAGES.wrongEnvironment
    );
  }

  // The account is keyed on the email Blackbaud verified for this login.
  if (!token.email) {
    logFailure(schoolId, "token email", new Error(`no email for school user ${caller.id}`));
    return fail(MESSAGES.failed);
  }

  try {
    const email = normalizeEmail(token.email);
    const userId = await findOrCreateParentAccount(
      email,
      caller.fullName ||
        [token.given_name, token.family_name].filter(Boolean).join(" ")
    );

    if (await getStaffRole(userId)) {
      return fail(MESSAGES.staff);
    }

    // Order matters: the password change invalidates earlier sign-in tokens,
    // so the session's token is issued last, inside startParentSession.
    await revokeParentPassword(userId);
    await ensureParentMembership(userId, schoolId);
    await startParentSession(email);
  } catch (caught: unknown) {
    logFailure(schoolId, "session", caught);
    return fail(MESSAGES.failed);
  }

  // Middleware sends first-time parents on to /welcome from here.
  return finish(`${origin}/s/${schoolSlug}/parent`);
}

function logFailure(schoolId: string, step: string, caught: unknown): void {
  const message = caught instanceof Error ? caught.message : "Unknown error";
  console.error(`Blackbaud parent sign-in failed at ${step} for school ${schoolId}: ${message}`);
}
