import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  ADMIN_GOOGLE_ONLY_MESSAGE,
  accessTokenSession,
  decideSchoolAdminSession,
  isAdminCapableIn,
  isAdminGoogleOnlyEnabled,
  type AdminSessionDecision,
} from "./admin-google-only";
import { GOOGLE_AUTH_SESSIONS_TABLE, isGoogleSessionToken } from "./google-session-store";

// The Supabase side of ADMIN_GOOGLE_ONLY (see admin-google-only.ts): marking
// Google sessions when they start, and looking the current one up.

/**
 * Marks the session behind `accessToken` (just issued by Supabase for a
 * Google sign-in) as a Google session. Never throws: on failure it logs and
 * returns false, and the session simply doesn't count as Google (admin
 * access then asks for Google sign-in again) rather than failing the sign-in.
 */
export async function recordGoogleSession(input: {
  accessToken: string | null | undefined;
  userId: string;
  via: "web" | "app";
}): Promise<boolean> {
  const claims = accessTokenSession(input.accessToken);
  if (!claims || claims.userId !== input.userId.toLowerCase()) {
    console.error("[admin-google-only] Google sign-in token has no usable session_id");
    return false;
  }
  try {
    const { error } = await createAdminClient()
      .from(GOOGLE_AUTH_SESSIONS_TABLE)
      .insert({ session_id: claims.sessionId, user_id: claims.userId, via: input.via });
    if (error) {
      console.error(`[admin-google-only] Could not record Google session: ${error.message}`);
      return false;
    }
    return true;
  } catch (caught: unknown) {
    console.error(
      `[admin-google-only] Could not record Google session: ${caught instanceof Error ? caught.message : caught}`
    );
    return false;
  }
}

/**
 * Whether the current request's session (for the user getUser() returned)
 * was started by Google sign-in. Cached per request.
 */
export const currentSessionIsGoogle = cache(async (userId: string): Promise<boolean> => {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return isGoogleSessionToken(createAdminClient(), session?.access_token, userId);
});

/**
 * The ADMIN_GOOGLE_ONLY decision for this user in one school (or, with no
 * membership, platform-wide). Only looks the session up when it matters:
 * flag on and the account has admin powers here.
 */
export async function adminSessionDecision(input: {
  userId: string;
  isSuperAdmin: boolean;
  membership: { role: string } | null;
}): Promise<AdminSessionDecision> {
  const enabled = isAdminGoogleOnlyEnabled();
  const needsLookup = enabled && isAdminCapableIn(input.isSuperAdmin, input.membership);
  return decideSchoolAdminSession({
    enabled,
    isSuperAdmin: input.isSuperAdmin,
    membership: input.membership,
    sessionIsGoogle: needsLookup ? await currentSessionIsGoogle(input.userId) : false,
  });
}

/**
 * ADMIN_GOOGLE_ONLY_MESSAGE when ADMIN_GOOGLE_ONLY is on and this account has
 * admin powers here (super-admin, or an admin membership) but the session
 * wasn't started by Google sign-in; else null. Applies to member-level
 * requests too: an admin-capable account's session reaches admin-level data
 * through RLS whatever page it's on. It never grants anything: the caller's
 * own checks still apply.
 */
export async function adminGoogleOnlyError(input: {
  userId: string;
  isSuperAdmin: boolean;
  membership: { role: string } | null;
}): Promise<string | null> {
  return (await adminSessionDecision(input)) === "allow" ? null : ADMIN_GOOGLE_ONLY_MESSAGE;
}

/** The super-admin's platform powers (no school involved): only from a Google session. */
export async function superAdminGoogleOnlyError(userId: string): Promise<string | null> {
  return adminGoogleOnlyError({ userId, isSuperAdmin: true, membership: null });
}
