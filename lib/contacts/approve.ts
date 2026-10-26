import type { SupabaseClient } from "@supabase/supabase-js";

// Bulk approval for the admin Contacts tab ("Approve all"). Kept out of the
// server action so the query's scoping is unit tested (approve.test.ts); the
// action authorizes the admin for `schoolId` before calling it.

/** More than any directory will hold; keeps the id filter a sane size. */
export const MAX_BULK_APPROVE = 500;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Approve the given suggested contacts — the ones the admin saw and confirmed
 * — in one update. Only rows of THIS school that are still "suggested" change:
 * an id from another school, or one already approved or rejected meanwhile,
 * is left alone. Returns how many were approved.
 */
export async function approveSuggestedContacts(
  supabase: SupabaseClient,
  schoolId: string,
  contactIds: readonly string[]
): Promise<{ approved: number; error?: { code?: string; message: string } }> {
  const ids = [...new Set(contactIds.filter((id) => typeof id === "string" && UUID_RE.test(id)))];
  if (ids.length === 0) return { approved: 0 };
  if (ids.length > MAX_BULK_APPROVE) {
    return { approved: 0, error: { message: `Approve at most ${MAX_BULK_APPROVE} contacts at once.` } };
  }

  const { data, error } = await supabase
    .from("school_contacts")
    .update({ status: "approved", updated_at: new Date().toISOString() })
    .eq("school_id", schoolId)
    .eq("status", "suggested")
    .in("id", ids)
    .select("id");
  if (error) return { approved: 0, error };
  return { approved: data?.length ?? 0 };
}
