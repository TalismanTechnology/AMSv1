"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSchoolBySlug } from "@/lib/school-context";
import { logAudit } from "@/lib/audit";
import {
  UNLOCK_ATTEMPT_WINDOW_MS,
  UNLOCK_TTL_MS,
  hashLockPassword,
  lockPasswordProblem,
  lockVersion,
  signUnlockToken,
  unlockCookieName,
  unlockRateLimit,
  unlockSigningKey,
  verifyLockPassword,
} from "@/lib/school-lock/core";
import {
  deleteSchoolLock,
  loadSchoolLock,
  recentFailedAttempts,
  recordAttempt,
  saveSchoolLock,
} from "@/lib/school-lock/store";

// The school owner lock (lib/school-lock): its own admins set, change and
// remove it; a locked-out super-admin unlocks it for a few hours. Passwords
// are never logged or returned, and the hash never leaves the server.

type Result = { success: true } | { error: string };

const TOO_MANY = "Too many wrong passwords. Try again in a few minutes.";

/**
 * Only the school's own admins manage its lock: an approved admin membership,
 * never platform privileges, so the super-admin can't change or remove it.
 */
async function requireGenuineSchoolAdmin(
  schoolId: string
): Promise<{ userId: string } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: membership } = await supabase
    .from("school_memberships")
    .select("role, approved")
    .eq("user_id", user.id)
    .eq("school_id", schoolId)
    .maybeSingle();
  if (membership?.role !== "admin" || !membership.approved) {
    return { error: "Only this school's own admins can manage the owner lock." };
  }
  return { userId: user.id };
}

/** Checks the current password (rate limited like unlocking). */
async function checkCurrentPassword(
  userId: string,
  schoolId: string,
  passwordHash: string,
  password: unknown
): Promise<string | null> {
  const failures = await recentFailedAttempts(userId, schoolId, Date.now() - UNLOCK_ATTEMPT_WINDOW_MS);
  if (!unlockRateLimit(failures).allowed) return TOO_MANY;
  const ok = await verifyLockPassword(password, passwordHash);
  await recordAttempt(userId, schoolId, ok);
  return ok ? null : "The current lock password is incorrect.";
}

/** Sets the lock, or changes its password (then the current one is required). */
export async function setSchoolOwnerLock(
  schoolId: string,
  input: { currentPassword?: string; newPassword: string }
): Promise<Result> {
  const auth = await requireGenuineSchoolAdmin(schoolId);
  if ("error" in auth) return auth;

  const problem = lockPasswordProblem(input.newPassword);
  if (problem) return { error: problem };

  try {
    const lock = await loadSchoolLock(schoolId);
    if (!lock.installed) {
      return { error: "The owner lock isn't available yet. Please try again later." };
    }
    if (lock.passwordHash) {
      const wrong = await checkCurrentPassword(
        auth.userId,
        schoolId,
        lock.passwordHash,
        input.currentPassword
      );
      if (wrong) return { error: wrong };
    }

    const error = await saveSchoolLock(schoolId, await hashLockPassword(input.newPassword), auth.userId);
    if (error) return { error };

    logAudit(
      auth.userId,
      lock.passwordHash ? "school_lock.change" : "school_lock.set",
      "school",
      schoolId,
      undefined,
      schoolId
    );
  } catch (err) {
    console.error("[school-lock] Saving the lock failed:", err instanceof Error ? err.message : err);
    return { error: "Couldn't save the lock. Please try again." };
  }

  revalidatePath("/", "layout");
  return { success: true };
}

/** Removes the lock. Requires the current password. */
export async function removeSchoolOwnerLock(
  schoolId: string,
  currentPassword: string
): Promise<Result> {
  const auth = await requireGenuineSchoolAdmin(schoolId);
  if ("error" in auth) return auth;

  try {
    const lock = await loadSchoolLock(schoolId);
    if (!lock.passwordHash) return { success: true };

    const wrong = await checkCurrentPassword(auth.userId, schoolId, lock.passwordHash, currentPassword);
    if (wrong) return { error: wrong };

    const error = await deleteSchoolLock(schoolId);
    if (error) return { error };

    logAudit(auth.userId, "school_lock.remove", "school", schoolId, undefined, schoolId);
  } catch (err) {
    console.error("[school-lock] Removing the lock failed:", err instanceof Error ? err.message : err);
    return { error: "Couldn't remove the lock. Please try again." };
  }

  revalidatePath("/", "layout");
  return { success: true };
}

/**
 * A super-admin enters the lock password: on success a signed, httpOnly
 * cookie unlocks this school (only) for them for UNLOCK_TTL_MS.
 */
export async function unlockSchool(
  slug: string,
  password: string
): Promise<{ success: true; redirectTo: string } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "super_admin") return { error: "Not authorized" };

  const school = await getSchoolBySlug(slug);
  if (!school) return { error: "School not found" };
  const redirectTo = `/s/${school.slug}/admin`;

  const key = unlockSigningKey();
  if (!key) return { error: "Unlocking isn't configured on this server." };

  try {
    const lock = await loadSchoolLock(school.id);
    if (!lock.passwordHash) return { success: true, redirectTo };

    const failures = await recentFailedAttempts(
      user.id,
      school.id,
      Date.now() - UNLOCK_ATTEMPT_WINDOW_MS
    );
    if (!unlockRateLimit(failures).allowed) return { error: TOO_MANY };

    const ok = await verifyLockPassword(password, lock.passwordHash);
    await recordAttempt(user.id, school.id, ok);
    if (!ok) return { error: "That password isn't right." };

    const expiresAt = Date.now() + UNLOCK_TTL_MS;
    const token = signUnlockToken(
      {
        schoolId: school.id,
        userId: user.id,
        version: lockVersion(lock.passwordHash, key),
        expiresAt,
      },
      key
    );
    (await cookies()).set(unlockCookieName(school.id), token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: Math.floor(UNLOCK_TTL_MS / 1000),
    });
    logAudit(user.id, "school_lock.unlock", "school", school.id, undefined, school.id);
  } catch (err) {
    console.error("[school-lock] Unlock failed:", err instanceof Error ? err.message : err);
    return { error: "Couldn't check the password. Please try again." };
  }

  return { success: true, redirectTo };
}

/** Ends this browser's unlock of a school early. */
export async function relockSchool(schoolId: string): Promise<Result> {
  (await cookies()).delete(unlockCookieName(schoolId));
  revalidatePath("/", "layout");
  return { success: true };
}
