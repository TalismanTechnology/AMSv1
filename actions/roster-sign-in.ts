"use server";

import crypto from "node:crypto";
import { after } from "next/server";
import { headers } from "next/headers";
import { getSchoolBySlug } from "@/lib/school-context";
import { resolveAuthProvider } from "@/lib/auth/provider";
import { resolveSchoolName } from "@/lib/school-display-name";
import {
  allowsParentPasswordLogin,
  ensureParentMembership,
  findOrCreateParentAccount,
  getStaffRole,
  revokeParentPassword,
  startParentSession,
} from "@/lib/auth/parent-session";
import { isValidEmail, normalizeRosterEmail } from "@/lib/roster/csv";
import { getRosterEntry, type RosterEntry } from "@/lib/roster/store";
import { syncRosterChildren } from "@/lib/roster/children";
import { rosterGateMessage } from "@/lib/roster/gate";
import {
  decideCodeRequest,
  decideVerification,
  emailLogTag,
  generateLoginCode,
  getLoginCodeSecret,
  hashClientIp,
  hashLoginCode,
  loginCodeMatches,
  normalizeLoginCode,
  RATE_LIMITS,
  unlistedEmailKey,
} from "@/lib/roster/login-code";
import {
  consumeCode,
  countCodeRequests,
  countRecentFailedAttempts,
  loadNewestCode,
  recordFailedAttempt,
  recordUnlistedRequest,
  storeLoginCode,
} from "@/lib/roster/login-code-store";
import { buildLoginCodeEmail, loginCodeFromAddress } from "@/lib/roster/login-email";
import { sendEmailWithResult } from "@/lib/email/resend";

// Email one-time-code sign-in for parents of "roster" schools: the school
// uploads its parent list (admin settings → Sign-in), and a parent on that
// list signs in with a 6-digit code sent to their email.
//
// The form runs on /s/<slug>/login, inside the iOS / Android web view too, so
// the session cookies land where they're needed: no system sheet or app
// handoff (compare lib/auth/app-handoff.ts). The session itself is the same
// Supabase session Blackbaud and Veracross sign-in start
// (lib/auth/parent-session.ts).
//
// No account enumeration: a code request gets the same answer whether or not
// the email is on the roster, and does the same database work either way;
// the email itself is sent after the response.

const MESSAGES = {
  sent: "If that email is on the school's list, a code is on its way. It expires in 10 minutes.",
  slowDown:
    "If that email is on the school's list, a code is on its way. Please wait a few minutes before requesting another.",
  invalidEmail: "Enter a valid email address.",
  invalidCode: "Enter the 6-digit code from the email.",
  notAvailable: "Email sign-in isn't available for this school.",
  // One message for wrong, expired and used-up codes: telling them apart
  // would reveal which addresses were sent a code, i.e. are on the roster.
  wrongCode: "That code isn't right or has expired. Check the email, or request a new code.",
  tooMany: "Too many attempts. Request a new code in a few minutes.",
  staff: "This is a staff account. Please use School staff sign-in instead.",
  failed: "We couldn't sign you in. Please try again.",
} as const;

export type RequestParentCodeResult =
  | { ok: true; message: string }
  | { ok: false; error: string; field?: "email" };

export type VerifyParentCodeResult =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string; field?: "code" };

interface RosterSchool {
  id: string;
  slug: string;
  name: string;
}

/** The school, only if it signs parents in by roster. */
async function loadRosterSchool(schoolSlug: unknown): Promise<RosterSchool | null> {
  if (typeof schoolSlug !== "string" || !schoolSlug.trim()) return null;
  const school = await getSchoolBySlug(schoolSlug.trim().toLowerCase());
  if (!school || resolveAuthProvider(school.auth_provider) !== "roster") return null;
  return {
    id: school.id,
    slug: school.slug,
    name: resolveSchoolName(school.name) ?? "your school",
  };
}

function parseEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = normalizeRosterEmail(value);
  return isValidEmail(email) ? email : null;
}

async function clientIpHash(secret: string): Promise<string> {
  const h = await headers();
  return hashClientIp(secret, h.get("x-forwarded-for") ?? h.get("x-real-ip"));
}

function errorMessage(caught: unknown): string {
  return caught instanceof Error ? caught.message : "Unknown error";
}

export async function requestParentCode(input: {
  schoolSlug: string;
  email: string;
}): Promise<RequestParentCodeResult> {
  const email = parseEmail(input?.email);
  if (!email) return { ok: false, error: MESSAGES.invalidEmail, field: "email" };

  const school = await loadRosterSchool(input.schoolSlug);
  if (!school) return { ok: false, error: MESSAGES.notAvailable };

  const secret = getLoginCodeSecret();
  if (!secret) {
    console.error("Roster sign-in: neither LOGIN_CODE_SECRET nor BLACKBAUD_TOKEN_ENC_KEY is set");
    return { ok: false, error: MESSAGES.failed };
  }

  const tag = emailLogTag(email);
  const now = new Date();

  try {
    const rosterResult = await getRosterEntry(school.id, email);
    if (!rosterResult.installed) return { ok: false, error: MESSAGES.notAvailable };

    const ipHash = await clientIpHash(secret);
    const emailKey = unlistedEmailKey(secret, school.id, email);
    const counts = await countCodeRequests({
      schoolId: school.id,
      emailKeys: [email, emailKey],
      ipHash,
      now,
    });
    const decision = decideCodeRequest(counts);
    if (!decision.allowed) {
      console.warn(`Roster sign-in: code request limited (${decision.reason}) school=${school.id} email=${tag}`);
      return { ok: true, message: MESSAGES.slowDown };
    }

    if (!rosterResult.entry) {
      // Record the attempt (for the limits) without keeping the address.
      await recordUnlistedRequest({
        schoolId: school.id,
        emailKey,
        codeHash: crypto.randomBytes(32).toString("hex"),
        ipHash,
        now,
      });
      console.info(`Roster sign-in: code requested for an address not on the roster school=${school.id} email=${tag}`);
      return { ok: true, message: MESSAGES.sent };
    }

    const code = generateLoginCode();
    await storeLoginCode({
      schoolId: school.id,
      email,
      codeHash: hashLoginCode(secret, school.id, email, code),
      ipHash,
      now,
    });

    // After the response, so a listed address doesn't answer slower.
    const message = buildLoginCodeEmail({ code, schoolName: school.name });
    after(async () => {
      const sent = await sendEmailWithResult({
        to: email,
        from: loginCodeFromAddress(),
        ...message,
      });
      if (sent.ok) {
        console.info(`Roster sign-in: code sent school=${school.id} email=${tag}`);
      } else {
        console.error(`Roster sign-in: code email failed school=${school.id} email=${tag}: ${sent.error}`);
      }
    });

    return { ok: true, message: MESSAGES.sent };
  } catch (caught: unknown) {
    console.error(`Roster sign-in: code request failed school=${school.id} email=${tag}: ${errorMessage(caught)}`);
    return { ok: false, error: MESSAGES.failed };
  }
}

/**
 * Checks the code and, if it's right, signs the parent in on this browser.
 * `appChallenge` is accepted for parity with the provider routes but not
 * needed: this runs inside the app's web view, which gets the cookies
 * directly.
 */
export async function verifyParentCode(input: {
  schoolSlug: string;
  email: string;
  code: string;
  appChallenge?: string;
}): Promise<VerifyParentCodeResult> {
  const email = parseEmail(input?.email);
  if (!email) return { ok: false, error: MESSAGES.invalidEmail };
  const code = normalizeLoginCode(input.code);
  if (!code) return { ok: false, error: MESSAGES.invalidCode, field: "code" };

  const school = await loadRosterSchool(input.schoolSlug);
  if (!school) return { ok: false, error: MESSAGES.notAvailable };

  const secret = getLoginCodeSecret();
  if (!secret) {
    console.error("Roster sign-in: neither LOGIN_CODE_SECRET nor BLACKBAUD_TOKEN_ENC_KEY is set");
    return { ok: false, error: MESSAGES.failed };
  }

  const tag = emailLogTag(email);
  const now = new Date();
  let entry: RosterEntry;

  try {
    const emailKeys = [email, unlistedEmailKey(secret, school.id, email)];
    const [stored, recentFailedAttempts] = await Promise.all([
      loadNewestCode(school.id, email),
      countRecentFailedAttempts({ schoolId: school.id, emailKeys, now }),
    ]);

    const decision = decideVerification({
      code: stored,
      matches: stored
        ? loginCodeMatches(secret, school.id, email, code, stored.code_hash)
        : false,
      recentFailedAttempts,
      now,
    });

    if (decision !== "ok" || !stored) {
      console.info(`Roster sign-in: verification ${decision} school=${school.id} email=${tag}`);
      // Only the overall limit is reported as such; it applies the same way
      // to addresses that aren't on the roster.
      if (recentFailedAttempts >= RATE_LIMITS.failedVerifiesPer15Minutes) {
        return { ok: false, error: MESSAGES.tooMany };
      }
      await recordFailedAttempt({ schoolId: school.id, emailKeys, now });
      return { ok: false, error: MESSAGES.wrongCode, field: "code" };
    }

    // Claim the code before anything else, so it works exactly once even if
    // the form is submitted twice.
    if (!(await consumeCode(stored.id, now))) {
      return { ok: false, error: MESSAGES.wrongCode, field: "code" };
    }

    const rosterResult = await getRosterEntry(school.id, email);
    if (!rosterResult.installed) return { ok: false, error: MESSAGES.notAvailable };
    if (!rosterResult.entry) {
      // Removed from the roster since the code was sent.
      console.info(`Roster sign-in: no longer on the roster school=${school.id} email=${tag}`);
      return { ok: false, error: rosterGateMessage(school.name) };
    }
    entry = rosterResult.entry;
  } catch (caught: unknown) {
    console.error(`Roster sign-in: verification failed school=${school.id} email=${tag}: ${errorMessage(caught)}`);
    return { ok: false, error: MESSAGES.failed };
  }

  try {
    const fullName = [entry.firstName, entry.lastName].filter(Boolean).join(" ");
    const { userId, secured } = await findOrCreateParentAccount(email, fullName);

    if (await getStaffRole(userId)) {
      return { ok: false, error: MESSAGES.staff };
    }

    // Same order as the provider callbacks: the password change invalidates
    // earlier sign-in tokens, so the session's token is issued last. Demo
    // accounts that sign in with a password keep it.
    if (!secured && !(await allowsParentPasswordLogin(userId))) {
      await revokeParentPassword(userId);
    }
    await ensureParentMembership(userId, school.id);

    // Best-effort, like Veracross: the parent can always add children on
    // /welcome.
    try {
      await syncRosterChildren({ userId, schoolId: school.id, children: entry.children });
    } catch (caught: unknown) {
      console.error(`Roster sign-in: children sync failed school=${school.id} email=${tag}: ${errorMessage(caught)}`);
    }

    await startParentSession(email);
  } catch (caught: unknown) {
    console.error(`Roster sign-in: session failed school=${school.id} email=${tag}: ${errorMessage(caught)}`);
    return { ok: false, error: MESSAGES.failed };
  }

  console.info(`Roster sign-in: signed in school=${school.id} email=${tag}`);
  // Middleware sends first-time parents on to /welcome from here; that page
  // skips itself when children were filled in from the roster.
  return { ok: true, redirectTo: `/s/${school.slug}/parent/chat` };
}
