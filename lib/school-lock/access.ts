import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  SCHOOL_LOCKED_ERROR,
  decideSchoolAccess,
  hasGenuineAccess,
  lockVersion,
  unlockCookieName,
  unlockSigningKey,
  verifyUnlockToken,
  type SchoolAccessInput,
} from "./core";
import { loadSchoolLock } from "./store";

// The one place the owner lock is enforced. Every guard that lets the
// super-admin into a school (requireSchoolContext for pages,
// requireSchoolAdmin and the other action guards, the API routes) asks here.
// Only interactive requests by a signed-in user come through these guards:
// crons, email intake, Blackbaud syncs and the chat pipeline's own
// service-role reads never do, so the lock can't affect them.

/**
 * True when a super-admin (with no qualifying membership of their own) must
 * be kept out of this school right now: it has a lock and they hold no valid
 * unlock cookie for it. Fails closed if the lock can't be read.
 */
export async function superAdminLockedOut(userId: string, schoolId: string): Promise<boolean> {
  let passwordHash: string | null;
  try {
    passwordHash = (await loadSchoolLock(schoolId)).passwordHash;
  } catch (err) {
    console.error("[school-lock]", err instanceof Error ? err.message : err);
    return true;
  }
  if (!passwordHash) return false;

  const key = unlockSigningKey();
  if (!key) return true;
  const token = (await cookies()).get(unlockCookieName(schoolId))?.value;
  return !verifyUnlockToken(
    token,
    { schoolId, userId, version: lockVersion(passwordHash, key) },
    key
  );
}

/**
 * The lock decision for a requester whose role and membership the caller has
 * already loaded. Only touches the lock table for a super-admin without a
 * qualifying membership, so everyone else pays nothing.
 */
export async function schoolAccessFor(
  input: Omit<SchoolAccessInput, "locked" | "unlocked"> & { userId: string; schoolId: string }
) {
  if (!input.isSuperAdmin || hasGenuineAccess(input.membership, input.need)) {
    return decideSchoolAccess({ ...input, locked: false, unlocked: false });
  }
  // "Locked out" already folds in a valid unlock cookie.
  const lockedOut = await superAdminLockedOut(input.userId, input.schoolId);
  return decideSchoolAccess({ ...input, locked: lockedOut, unlocked: false });
}

/**
 * For server actions and routes that rely on RLS (or the service role) rather
 * than requireSchoolAdmin: SCHOOL_LOCKED_ERROR when the signed-in user is a
 * super-admin locked out of this school, else null. It never grants access;
 * the caller's own checks still apply.
 */
export async function schoolLockError(
  schoolId: string | null | undefined,
  need: "admin" | "member" = "admin",
  /** The signed-in user's id when the caller already has it (null: signed out). */
  knownUserId?: string | null
): Promise<string | null> {
  if (!schoolId || knownUserId === null) return null;
  const supabase = await createClient();
  let userId = knownUserId;
  if (userId === undefined) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    userId = user.id;
  }
  const user = { id: userId };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "super_admin") return null;

  const { data: membership } = await supabase
    .from("school_memberships")
    .select("role, approved")
    .eq("user_id", user.id)
    .eq("school_id", schoolId)
    .maybeSingle();

  const access = await schoolAccessFor({
    userId: user.id,
    schoolId,
    isSuperAdmin: true,
    membership: membership ?? null,
    need,
  });
  return access === "locked" ? SCHOOL_LOCKED_ERROR : null;
}

/** Like schoolLockError, but throws: for actions that report errors by throwing. */
export async function assertSchoolNotLocked(
  schoolId: string | null | undefined,
  need: "admin" | "member" = "admin",
  knownUserId?: string | null
): Promise<void> {
  const error = await schoolLockError(schoolId, need, knownUserId);
  if (error) throw new Error(error);
}
