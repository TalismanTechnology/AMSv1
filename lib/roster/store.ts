import { createAdminClient } from "@/lib/supabase/admin";
import { isNotInstalledError } from "@/lib/supabase/not-installed";
import type { RosterChild, RosterParent } from "./csv";

// The school-uploaded parent roster (school_roster, migration 044). Service
// role only: the table has RLS on and no policies. Every function reports
// `installed: false` instead of throwing while 044 hasn't been applied.

export interface RosterEntry {
  email: string;
  firstName: string | null;
  lastName: string | null;
  children: RosterChild[];
}

export type NotInstalled = { installed: false };

const UPSERT_CHUNK = 500;
const READ_PAGE = 1000;
const DEACTIVATE_CHUNK = 200;

function parseChildren(value: unknown): RosterChild[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): RosterChild[] => {
    const name = typeof item?.name === "string" ? item.name.trim() : "";
    if (!name) return [];
    return [{ name, grade: typeof item.grade === "string" && item.grade ? item.grade : null }];
  });
}

/** The active roster row for this email at this school, if any. */
export async function getRosterEntry(
  schoolId: string,
  email: string
): Promise<NotInstalled | { installed: true; entry: RosterEntry | null }> {
  const { data, error } = await createAdminClient()
    .from("school_roster")
    .select("email, first_name, last_name, children")
    .eq("school_id", schoolId)
    .eq("email", email.trim().toLowerCase())
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    if (isNotInstalledError(error)) return { installed: false };
    throw new Error(`Could not read school roster: ${error.message}`);
  }

  return {
    installed: true,
    entry: data
      ? {
          email: data.email,
          firstName: data.first_name,
          lastName: data.last_name,
          children: parseChildren(data.children),
        }
      : null,
  };
}

/** How many parents are active on the roster, and when it last changed. */
export async function getRosterSummary(
  schoolId: string
): Promise<NotInstalled | { installed: true; activeCount: number; lastUpdatedAt: string | null }> {
  const admin = createAdminClient();
  const [count, latest] = await Promise.all([
    admin
      .from("school_roster")
      .select("id", { count: "exact", head: true })
      .eq("school_id", schoolId)
      .eq("is_active", true),
    admin
      .from("school_roster")
      .select("updated_at")
      .eq("school_id", schoolId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const error = count.error ?? latest.error;
  if (error) {
    if (isNotInstalledError(error)) return { installed: false };
    throw new Error(`Could not read school roster: ${error.message}`);
  }

  return {
    installed: true,
    activeCount: count.count ?? 0,
    lastUpdatedAt: (latest.data?.updated_at as string | undefined) ?? null,
  };
}

/** Pure: what replacing the roster with these emails would do. */
export function planRosterReplacement(
  existing: Map<string, { id: string; isActive: boolean }>,
  uploadedEmails: string[]
): { inserted: number; updated: number; deactivateIds: string[] } {
  const uploaded = new Set(uploadedEmails.map((email) => email.trim().toLowerCase()));
  const inserted = [...uploaded].filter((email) => !existing.has(email)).length;
  return {
    inserted,
    updated: uploaded.size - inserted,
    deactivateIds: [...existing.entries()]
      .filter(([email, row]) => row.isActive && !uploaded.has(email))
      .map(([, row]) => row.id),
  };
}

/** Every roster row of the school (active or not), keyed by email. */
async function loadExistingRoster(
  schoolId: string
): Promise<NotInstalled | { installed: true; rows: Map<string, { id: string; isActive: boolean }> }> {
  const admin = createAdminClient();
  const rows = new Map<string, { id: string; isActive: boolean }>();

  // Paged: PostgREST caps each response.
  for (let from = 0; ; from += READ_PAGE) {
    const { data, error } = await admin
      .from("school_roster")
      .select("id, email, is_active")
      .eq("school_id", schoolId)
      .order("id", { ascending: true })
      .range(from, from + READ_PAGE - 1);

    if (error) {
      if (isNotInstalledError(error)) return { installed: false };
      throw new Error(`Could not read school roster: ${error.message}`);
    }
    for (const row of data ?? []) {
      rows.set(row.email as string, { id: row.id as string, isActive: row.is_active as boolean });
    }
    if (!data || data.length < READ_PAGE) break;
  }

  return { installed: true, rows };
}

/** Counts for the "replace roster" confirmation, without writing anything. */
export async function previewRosterReplacement(
  schoolId: string,
  uploadedEmails: string[]
): Promise<NotInstalled | { installed: true; inserted: number; updated: number; deactivated: number }> {
  const existing = await loadExistingRoster(schoolId);
  if (!existing.installed) return existing;
  const plan = planRosterReplacement(existing.rows, uploadedEmails);
  return {
    installed: true,
    inserted: plan.inserted,
    updated: plan.updated,
    deactivated: plan.deactivateIds.length,
  };
}

/**
 * Makes `parents` the school's active roster: every parent in the upload is
 * inserted or updated (and reactivated), and every currently active parent
 * missing from it is deactivated. Nothing is ever deleted, so re-uploading
 * an older file brings people back.
 */
export async function replaceRoster(
  schoolId: string,
  parents: RosterParent[]
): Promise<NotInstalled | { installed: true; inserted: number; updated: number; deactivated: number }> {
  const existing = await loadExistingRoster(schoolId);
  if (!existing.installed) return existing;

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const rows = parents.map((parent) => ({
    school_id: schoolId,
    email: parent.email.trim().toLowerCase(),
    first_name: parent.firstName,
    last_name: parent.lastName,
    children: parent.children,
    is_active: true,
    source: "csv",
    updated_at: now,
  }));
  const plan = planRosterReplacement(
    existing.rows,
    rows.map((row) => row.email)
  );

  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const { error } = await admin
      .from("school_roster")
      .upsert(rows.slice(i, i + UPSERT_CHUNK), { onConflict: "school_id,email" });
    if (error) throw new Error(`Could not save school roster: ${error.message}`);
  }

  for (let i = 0; i < plan.deactivateIds.length; i += DEACTIVATE_CHUNK) {
    const { error } = await admin
      .from("school_roster")
      .update({ is_active: false, updated_at: now })
      .eq("school_id", schoolId)
      .in("id", plan.deactivateIds.slice(i, i + DEACTIVATE_CHUNK));
    if (error) throw new Error(`Could not deactivate roster rows: ${error.message}`);
  }

  return {
    installed: true,
    inserted: plan.inserted,
    updated: plan.updated,
    deactivated: plan.deactivateIds.length,
  };
}
