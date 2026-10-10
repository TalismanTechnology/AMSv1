import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  ensureParentMembership,
  findOrCreateParentAccount,
  getStaffRole,
  revokeParentPassword,
  startParentSession,
} from "@/lib/auth/parent-session";
import { normalizeEmail } from "@/lib/blackbaud/crypto";
import { appCallbackUrl, createAppHandoff } from "@/lib/auth/app-handoff";
import {
  VERACROSS_LOGIN_STATE_COOKIE,
  unpackLoginCookie,
  verifyVeracrossLoginState,
} from "@/lib/blackbaud/state";
import {
  getVeracrossConnectionWithSecret,
  recordVeracrossError,
  type VeracrossConnection,
} from "@/lib/veracross/connection";
import {
  decideVeracrossParentAccess,
  exchangeVeracrossCode,
  fetchVeracrossUser,
  getVeracrossRedirectUri,
  type VeracrossUser,
} from "@/lib/veracross/oauth";
import { lookupVeracrossFamily } from "@/lib/veracross/data-api";
import {
  checkVeracrossLink,
  recordVeracrossLink,
  syncVeracrossChildren,
} from "@/lib/veracross/link";

// Veracross sends the parent's browser back here after they sign in.
//
//   GET /auth/veracross/callback?code=...&state=...
//
// Same contract as /auth/blackbaud/callback: only people the school's own
// Veracross lists with a parent role get through. Everyone else — staff,
// students, other schools — goes back to the login page with no session.

const MESSAGES = {
  cancelled: "Veracross sign-in was cancelled.",
  expired: "Your sign-in link expired. Please try again.",
  failed: "We couldn't sign you in with Veracross. Please try again.",
  notParent:
    "Only parents and guardians can sign in here, and your Veracross account isn't listed as one. If that's wrong, please contact your school office.",
  noEmail:
    "Your Veracross account doesn't have an email address on file. Please ask your school office to add one, then try again.",
  mismatch:
    "This email is already linked to a different Veracross account. Please contact your school office.",
  staff: "This is a staff account. Please use School staff sign-in instead.",
} as const;

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const cookieStore = await cookies();
  const packed = unpackLoginCookie(cookieStore.get(VERACROSS_LOGIN_STATE_COOKIE)?.value);

  const state = searchParams.get("state");
  const verified =
    state && packed ? verifyVeracrossLoginState(state, packed.state) : null;

  // Single-use: consumed on every outcome.
  const finish = (url: string) => {
    const response = NextResponse.redirect(url);
    response.cookies.delete({ name: VERACROSS_LOGIN_STATE_COOKIE, path: "/auth/veracross" });
    return response;
  };

  if (!verified || !packed) {
    return finish(`${origin}/login?error=${encodeURIComponent(MESSAGES.expired)}`);
  }

  const { schoolId, schoolSlug, appChallenge } = verified;
  const fail = (message: string) =>
    finish(
      appChallenge
        ? appCallbackUrl({ error: message, school: schoolSlug })
        : `${origin}/s/${schoolSlug}/login?error=${encodeURIComponent(message)}`
    );

  const code = searchParams.get("code");

  if (searchParams.get("error") || !code) {
    return fail(MESSAGES.cancelled);
  }

  let connection: VeracrossConnection;
  let clientSecret: string;
  let user: VeracrossUser;

  try {
    const loaded = await getVeracrossConnectionWithSecret(schoolId);
    if (!loaded) throw new Error("Veracross sign-in is not configured for this school");
    ({ connection, clientSecret } = loaded);

    const token = await exchangeVeracrossCode({
      client: { schoolRoute: connection.schoolRoute, clientId: connection.clientId },
      clientSecret,
      code,
      redirectUri: getVeracrossRedirectUri(origin),
      codeVerifier: packed.verifier,
    });
    user = await fetchVeracrossUser(connection.schoolRoute, token.access_token);
  } catch (caught: unknown) {
    await logFailure(schoolId, "identify caller", caught, true);
    return fail(MESSAGES.failed);
  }

  const decision = decideVeracrossParentAccess({
    user,
    parentRoles: connection.parentRoles,
  });

  if (!decision.allowed) {
    return fail(decision.reason === "no_email" ? MESSAGES.noEmail : MESSAGES.notParent);
  }

  let handoffCode: string | null = null;

  try {
    const email = normalizeEmail(decision.email);
    const { userId, secured } = await findOrCreateParentAccount(email, user.fullName);

    if (await getStaffRole(userId)) {
      return fail(MESSAGES.staff);
    }

    const link = await checkVeracrossLink(schoolId, userId, user.sub);
    if (!link.ok) {
      await logFailure(
        schoolId,
        "link",
        new Error(`Veracross account ${user.sub} does not match the account linked to ${userId}`)
      );
      return fail(MESSAGES.mismatch);
    }

    // Order matters (see /auth/blackbaud/callback): the password change
    // invalidates earlier sign-in tokens, so the session's is issued last.
    if (!secured) await revokeParentPassword(userId);
    await ensureParentMembership(userId, schoolId);

    const personId = await linkFamily({
      connection,
      clientSecret,
      user,
      userId,
      firstLink: link.firstLink,
    });
    await recordVeracrossLink({ schoolId, userId, accountSub: user.sub, personId });

    if (appChallenge) {
      handoffCode = await createAppHandoff({ email, schoolSlug, appChallenge });
    } else {
      await startParentSession(email);
    }
  } catch (caught: unknown) {
    await logFailure(schoolId, "session", caught);
    return fail(MESSAGES.failed);
  }

  if (handoffCode) {
    return finish(appCallbackUrl({ code: handoffCode }));
  }

  // Middleware sends first-time parents on to /welcome from here; that page
  // skips itself when children were filled in from Veracross.
  return finish(`${origin}/s/${schoolSlug}/parent`);
}

/**
 * Best-effort: children + grades from the Data API. Never blocks sign-in —
 * the parent can always add children on /welcome. Returns the Person ID.
 */
async function linkFamily(input: {
  connection: VeracrossConnection;
  clientSecret: string;
  user: VeracrossUser;
  userId: string;
  firstLink: boolean;
}): Promise<string | null> {
  if (!input.connection.dataApiEnabled || !input.user.username) return null;

  try {
    const family = await lookupVeracrossFamily({
      connection: input.connection,
      clientSecret: input.clientSecret,
      username: input.user.username,
    });
    if (!family) return null;

    await syncVeracrossChildren({
      userId: input.userId,
      schoolId: input.connection.schoolId,
      children: family.children,
      firstLink: input.firstLink,
    });

    return family.personId;
  } catch (caught: unknown) {
    await logFailure(input.connection.schoolId, "children lookup", caught, true);
    return null;
  }
}

async function logFailure(
  schoolId: string,
  step: string,
  caught: unknown,
  record = false
): Promise<void> {
  const message = caught instanceof Error ? caught.message : "Unknown error";
  console.error(`Veracross parent sign-in failed at ${step} for school ${schoolId}: ${message}`);
  if (record) {
    await recordVeracrossError(schoolId, `${step}: ${message}`).catch(() => undefined);
  }
}
