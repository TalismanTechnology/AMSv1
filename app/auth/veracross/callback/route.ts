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
import { checkRosterGate, rosterGateMessage } from "@/lib/roster/gate";
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
import { getVeracrossRedirectUri, type VeracrossUser } from "@/lib/veracross/oauth";
import { lookupVeracrossFamily } from "@/lib/veracross/data-api";
import {
  VeracrossHttpError,
  logVeracrossFailure,
  logVeracrossSignIn,
  type VeracrossFailure,
} from "@/lib/veracross/log";
import {
  identifyVeracrossParent,
  type VeracrossIdentifyResult,
} from "@/lib/veracross/sign-in";
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
    logVeracrossFailure({ step: "authorize", schoolId: null, reason: "missing or invalid state" });
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
    const error = searchParams.get("error");
    logVeracrossFailure({
      step: "authorize",
      schoolId,
      reason: error ? `provider error ${error.replace(/[^a-z_]/gi, "").slice(0, 40)}` : "no code",
    });
    return fail(MESSAGES.cancelled);
  }

  let connection: VeracrossConnection;
  let clientSecret: string;
  let identified: VeracrossIdentifyResult;

  try {
    const loaded = await getVeracrossConnectionWithSecret(schoolId);
    if (!loaded) throw new Error("Veracross sign-in is not configured for this school");
    ({ connection, clientSecret } = loaded);

    identified = await identifyVeracrossParent({
      connection,
      clientSecret,
      code,
      redirectUri: getVeracrossRedirectUri(origin),
      codeVerifier: packed.verifier,
    });
  } catch (caught: unknown) {
    await logFailure({ step: "token", schoolId, error: caught }, "identify caller");
    return fail(MESSAGES.failed);
  }

  if (!identified.ok) {
    await logFailure(
      { step: identified.step, schoolId, route: connection.schoolRoute, error: identified.error },
      "identify caller"
    );
    return fail(MESSAGES.failed);
  }

  const { user, decision } = identified;

  if (!decision.allowed) {
    logVeracrossFailure({
      step: "gate",
      schoolId,
      route: connection.schoolRoute,
      reason: decision.reason,
      // Role names are school-wide labels, not personal data, and are what
      // to compare against parent_roles when a real parent is refused.
      extra: { roles: user.roles.slice(0, 20) },
    });
    return fail(decision.reason === "no_email" ? MESSAGES.noEmail : MESSAGES.notParent);
  }

  // Optional school setting (off unless the school turned it on): parents
  // must also be on the school's uploaded roster.
  const gate = await checkRosterGate(schoolId, normalizeEmail(decision.email));
  if (gate.outcome !== "pass") {
    logVeracrossFailure({
      step: "gate",
      schoolId,
      route: connection.schoolRoute,
      reason: gate.outcome === "blocked" ? "not on school roster" : "roster lookup failed",
    });
    return fail(
      gate.outcome === "blocked" ? rosterGateMessage(gate.schoolName) : MESSAGES.failed
    );
  }

  let handoffCode: string | null = null;

  try {
    const email = normalizeEmail(decision.email);
    const { userId, secured } = await findOrCreateParentAccount(email, user.fullName);

    if (await getStaffRole(userId)) {
      logVeracrossFailure({
        step: "gate",
        schoolId,
        route: connection.schoolRoute,
        reason: "staff account",
      });
      return fail(MESSAGES.staff);
    }

    const link = await checkVeracrossLink(schoolId, userId, user.sub);
    if (!link.ok) {
      await logFailure({
        step: "link",
        schoolId,
        route: connection.schoolRoute,
        error: new Error(
          `Veracross account ${user.sub} does not match the account linked to ${userId}`
        ),
      });
      return fail(MESSAGES.mismatch);
    }

    // Order matters (see /auth/blackbaud/callback): the password change
    // invalidates earlier sign-in tokens, so the session's is issued last.
    if (!secured) await revokeParentPassword(userId);
    await ensureParentMembership(userId, schoolId);

    const family = await linkFamily({
      connection,
      clientSecret,
      user,
      userId,
      firstLink: link.firstLink,
    });
    await recordVeracrossLink({ schoolId, userId, accountSub: user.sub, personId: family.personId });

    if (appChallenge) {
      handoffCode = await createAppHandoff({ email, schoolSlug, appChallenge });
    } else {
      await startParentSession(email);
    }

    logVeracrossSignIn({
      schoolId,
      route: connection.schoolRoute,
      firstLink: link.firstLink,
      app: Boolean(appChallenge),
      children: family.children,
    });
  } catch (caught: unknown) {
    await logFailure({ step: "link", schoolId, route: connection.schoolRoute, error: caught });
    return fail(MESSAGES.failed);
  }

  if (handoffCode) {
    return finish(appCallbackUrl({ code: handoffCode }));
  }

  // Middleware sends first-time parents on to /welcome from here; that page
  // skips itself when children were filled in from Veracross.
  return finish(`${origin}/s/${schoolSlug}/parent/chat`);
}

interface LinkedFamily {
  personId: string | null;
  /** Counts for the sign-in log line; null when the lookup didn't run or failed. */
  children: { found: number; inserted: number; updated: number } | null;
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
}): Promise<LinkedFamily> {
  const skipped: LinkedFamily = { personId: null, children: null };
  if (!input.connection.dataApiEnabled || !input.user.username) return skipped;

  try {
    const family = await lookupVeracrossFamily({
      connection: input.connection,
      clientSecret: input.clientSecret,
      username: input.user.username,
    });
    if (!family) return skipped;

    const counts = await syncVeracrossChildren({
      userId: input.userId,
      schoolId: input.connection.schoolId,
      children: family.children,
      firstLink: input.firstLink,
    });

    return {
      personId: family.personId,
      children: { found: family.children.length, ...counts },
    };
  } catch (caught: unknown) {
    await logFailure(
      {
        // client_token / data_api when Veracross answered with an error.
        step: caught instanceof VeracrossHttpError ? caught.step : "children",
        schoolId: input.connection.schoolId,
        route: input.connection.schoolRoute,
        error: caught,
      },
      "children lookup"
    );
    return skipped;
  }
}

/**
 * One structured `[veracross]` log line; with `recordAs`, also the full
 * message in veracross_connections.last_error (as `<recordAs>: <message>`).
 */
async function logFailure(failure: VeracrossFailure, recordAs?: string): Promise<void> {
  logVeracrossFailure(failure);
  if (recordAs && failure.schoolId) {
    const message = failure.error instanceof Error ? failure.error.message : "Unknown error";
    await recordVeracrossError(failure.schoolId, `${recordAs}: ${message}`).catch(() => undefined);
  }
}
