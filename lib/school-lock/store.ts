import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";

// Database side of the owner lock (migration 050). Service role only: the
// tables have RLS on and no policies, so the hash never reaches a browser.
// Before 050 is applied the tables are missing and every school reads as
// unlocked.

export interface SchoolLockRow {
  /** False until migration 050 is applied. */
  installed: boolean;
  /** The stored scrypt hash, or null when the school isn't locked. */
  passwordHash: string | null;
  updatedAt: string | null;
}

export function isLockTableMissing(
  error: { code?: string | null; message?: string | null } | null | undefined
): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  return (
    /school_owner_lock/.test(error.message ?? "") &&
    /does not exist|schema cache|could not find the table/i.test(error.message ?? "")
  );
}

/**
 * The school's lock. Throws on an unexpected database error, so callers can
 * fail closed. Cached per request (pages, layouts and guards all ask).
 */
export const loadSchoolLock = cache(async (schoolId: string): Promise<SchoolLockRow> => {
  const { data, error } = await createAdminClient()
    .from("school_owner_locks")
    .select("password_hash, updated_at")
    .eq("school_id", schoolId)
    .maybeSingle();
  if (error) {
    if (isLockTableMissing(error)) return { installed: false, passwordHash: null, updatedAt: null };
    throw new Error(`Loading the school lock failed: ${error.message}`);
  }
  return {
    installed: true,
    passwordHash: (data?.password_hash as string | undefined) ?? null,
    updatedAt: (data?.updated_at as string | undefined) ?? null,
  };
});

/** Ids of the schools with a lock set (for cross-school super-admin views). */
export async function loadLockedSchoolIds(): Promise<Set<string>> {
  const { data, error } = await createAdminClient()
    .from("school_owner_locks")
    .select("school_id");
  if (error) {
    if (isLockTableMissing(error)) return new Set();
    throw new Error(`Loading school locks failed: ${error.message}`);
  }
  return new Set((data ?? []).map((row) => row.school_id as string));
}

export async function saveSchoolLock(
  schoolId: string,
  passwordHash: string,
  userId: string
): Promise<string | null> {
  const { error } = await createAdminClient()
    .from("school_owner_locks")
    .upsert(
      {
        school_id: schoolId,
        password_hash: passwordHash,
        set_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "school_id" }
    );
  if (!error) return null;
  return isLockTableMissing(error) ? LOCK_NOT_INSTALLED_MESSAGE : "Couldn't save the lock. Please try again.";
}

export async function deleteSchoolLock(schoolId: string): Promise<string | null> {
  const { error } = await createAdminClient()
    .from("school_owner_locks")
    .delete()
    .eq("school_id", schoolId);
  if (!error) return null;
  return isLockTableMissing(error) ? LOCK_NOT_INSTALLED_MESSAGE : "Couldn't remove the lock. Please try again.";
}

export const LOCK_NOT_INSTALLED_MESSAGE =
  "The owner lock isn't available yet (database migration 050_school_owner_locks.sql hasn't been applied).";

/** Times (ms) of this user's failed password attempts for the school within `sinceMs`. */
export async function recentFailedAttempts(
  userId: string,
  schoolId: string,
  sinceMs: number
): Promise<number[]> {
  const { data, error } = await createAdminClient()
    .from("school_owner_lock_attempts")
    .select("created_at")
    .eq("user_id", userId)
    .eq("school_id", schoolId)
    .eq("succeeded", false)
    .gte("created_at", new Date(sinceMs).toISOString())
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`Loading unlock attempts failed: ${error.message}`);
  return (data ?? []).map((row) => Date.parse(row.created_at as string));
}

export async function recordAttempt(
  userId: string,
  schoolId: string,
  succeeded: boolean
): Promise<void> {
  const { error } = await createAdminClient()
    .from("school_owner_lock_attempts")
    .insert({ user_id: userId, school_id: schoolId, succeeded });
  if (error) console.error("[school-lock] Recording an attempt failed:", error.message);
}
