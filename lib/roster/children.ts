import { createAdminClient } from "@/lib/supabase/admin";
import { GRADE_VALUES } from "@/lib/grades";
import { normalizeChildName, type RosterChild } from "./csv";

// Fills in a parent's children from the school's roster on sign-in. Same
// rules as Veracross (lib/veracross/link.ts syncVeracrossChildren):
//
// - Children already linked to a roster child (external_source = 'roster',
//   external_id = normalised name) get their name and grade refreshed.
// - New roster children are added only on the parent's first roster sign-in
//   when they have no hand-entered children, or while they have no children
//   at all, so a child the parent removed doesn't keep coming back and
//   nothing duplicates hand-entered children.
// - Nothing is ever deleted.
//
// There's no link table for roster sign-ins, so "first roster sign-in" means
// "no roster-linked children yet".
//
// children.grade is NOT NULL (migration 004), so a roster child whose grade
// wasn't recognised is not inserted (the parent can add them on /welcome or
// in account settings), and a linked child keeps its grade.

export const ROSTER_SOURCE = "roster";

export interface ExistingChildRow {
  id: string;
  external_source: string | null;
  external_id: string | null;
}

export interface ChildrenPlan {
  updates: { id: string; name: string; grade?: string }[];
  inserts: { name: string; grade: string; externalId: string }[];
}

function validGrade(grade: string | null): string | null {
  return grade && GRADE_VALUES.includes(grade) ? grade : null;
}

/** Pure: what to write for these roster children, given the parent's rows. */
export function planRosterChildrenSync(
  existing: ExistingChildRow[],
  rosterChildren: RosterChild[]
): ChildrenPlan {
  const linked = new Map(
    existing
      .filter((row) => row.external_source === ROSTER_SOURCE && row.external_id)
      .map((row) => [row.external_id as string, row.id])
  );
  const firstLink = linked.size === 0;
  const hasManualChildren = existing.some((row) => !row.external_id);
  const mayInsert = firstLink ? !hasManualChildren : existing.length === 0;

  const plan: ChildrenPlan = { updates: [], inserts: [] };
  const seen = new Set<string>();

  for (const child of rosterChildren) {
    const externalId = normalizeChildName(child.name);
    if (!externalId || seen.has(externalId)) continue;
    seen.add(externalId);

    const grade = validGrade(child.grade);
    const rowId = linked.get(externalId);

    if (rowId) {
      plan.updates.push({ id: rowId, name: child.name, ...(grade ? { grade } : {}) });
    } else if (mayInsert && grade) {
      plan.inserts.push({ name: child.name, grade, externalId });
    }
  }

  return plan;
}

export async function syncRosterChildren(input: {
  userId: string;
  schoolId: string;
  children: RosterChild[];
}): Promise<{ inserted: number; updated: number }> {
  if (input.children.length === 0) return { inserted: 0, updated: 0 };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("children")
    .select("id, external_source, external_id")
    .eq("parent_id", input.userId)
    .eq("school_id", input.schoolId);

  if (error) throw new Error(`Could not read children: ${error.message}`);

  const plan = planRosterChildrenSync((data ?? []) as ExistingChildRow[], input.children);

  for (const update of plan.updates) {
    const { id, ...fields } = update;
    const { error: updateError } = await admin.from("children").update(fields).eq("id", id);
    if (updateError) throw new Error(`Could not update child: ${updateError.message}`);
  }

  if (plan.inserts.length > 0) {
    const { error: insertError } = await admin.from("children").insert(
      plan.inserts.map((child) => ({
        parent_id: input.userId,
        school_id: input.schoolId,
        name: child.name,
        grade: child.grade,
        external_source: ROSTER_SOURCE,
        external_id: child.externalId,
      }))
    );
    if (insertError) throw new Error(`Could not add children: ${insertError.message}`);
  }

  return { inserted: plan.inserts.length, updated: plan.updates.length };
}
