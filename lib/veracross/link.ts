import { createAdminClient } from "@/lib/supabase/admin";
import type { VeracrossChild } from "./data-api";

// Ties an AskMySchool parent account to the Veracross account that signed in,
// and fills in their children from the school's records.

export type LinkDecision =
  | { ok: true; firstLink: boolean }
  | { ok: false; reason: "account_mismatch" };

/**
 * Pure rule, given any existing links that share this school + account id or
 * this school + user. A Veracross account maps to one AskMySchool account and
 * vice versa; anything else means an email moved between people.
 */
export function decideLink(
  existing: { user_id: string; account_sub: string }[],
  userId: string,
  accountSub: string
): LinkDecision {
  if (existing.length === 0) return { ok: true, firstLink: true };

  const consistent = existing.every(
    (link) => link.user_id === userId && link.account_sub === accountSub
  );

  return consistent ? { ok: true, firstLink: false } : { ok: false, reason: "account_mismatch" };
}

export async function checkVeracrossLink(
  schoolId: string,
  userId: string,
  accountSub: string
): Promise<LinkDecision> {
  const { data, error } = await createAdminClient()
    .from("veracross_parent_links")
    .select("user_id, account_sub")
    .eq("school_id", schoolId)
    .or(`account_sub.eq.${JSON.stringify(accountSub)},user_id.eq.${userId}`);

  if (error) {
    throw new Error(`Could not read Veracross links: ${error.message}`);
  }

  return decideLink(data ?? [], userId, accountSub);
}

export async function recordVeracrossLink(input: {
  schoolId: string;
  userId: string;
  accountSub: string;
  personId: string | null;
}): Promise<void> {
  const row: Record<string, unknown> = {
    school_id: input.schoolId,
    user_id: input.userId,
    account_sub: input.accountSub,
    last_sign_in_at: new Date().toISOString(),
  };
  // Don't erase a Person ID found earlier when today's lookup was skipped.
  if (input.personId) row.person_id = Number(input.personId);

  const { error } = await createAdminClient()
    .from("veracross_parent_links")
    .upsert(row, { onConflict: "school_id,account_sub" });

  if (error) {
    throw new Error(`Could not record Veracross link: ${error.message}`);
  }
}

/**
 * Writes the school's view of a parent's children.
 *
 * - Children already linked to a Veracross student get their name and grade
 *   refreshed (grades advance every year).
 * - New Veracross children are added only on the first linked sign-in, or
 *   while the parent has no children at all, so a child the parent removed
 *   doesn't keep coming back and nothing duplicates hand-entered children.
 */
export async function syncVeracrossChildren(input: {
  userId: string;
  schoolId: string;
  children: VeracrossChild[];
  firstLink: boolean;
}): Promise<{ inserted: number; updated: number }> {
  const admin = createAdminClient();

  const { data: existing, error } = await admin
    .from("children")
    .select("id, external_source, external_id")
    .eq("parent_id", input.userId)
    .eq("school_id", input.schoolId);

  if (error) {
    throw new Error(`Could not read children: ${error.message}`);
  }

  const rows = existing ?? [];
  const linked = new Map(
    rows
      .filter((row) => row.external_source === "veracross" && row.external_id)
      .map((row) => [row.external_id as string, row.id as string])
  );
  const hasManualChildren = rows.some((row) => !row.external_id);
  const mayInsert = input.firstLink ? !hasManualChildren : rows.length === 0;

  let inserted = 0;
  let updated = 0;

  for (const child of input.children) {
    const rowId = linked.get(child.externalId);

    if (rowId) {
      const { error: updateError } = await admin
        .from("children")
        .update({ name: child.name, grade: child.grade })
        .eq("id", rowId);
      if (updateError) throw new Error(`Could not update child: ${updateError.message}`);
      updated += 1;
    } else if (mayInsert) {
      const { error: insertError } = await admin.from("children").insert({
        parent_id: input.userId,
        school_id: input.schoolId,
        name: child.name,
        grade: child.grade,
        external_source: "veracross",
        external_id: child.externalId,
      });
      if (insertError) throw new Error(`Could not add child: ${insertError.message}`);
      inserted += 1;
    }
  }

  return { inserted, updated };
}
