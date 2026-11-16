import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_DIVISIONS } from "@/lib/documents/division-categories";
import { generateInboundToken } from "@/lib/email/token";
import { GRADE_VALUES } from "@/lib/grades";
import type { EventCalendar } from "@/lib/types";

/** A division's own inbound address. */
export interface DivisionAddress {
  id: string;
  token: string;
  divisionId: string;
}

/**
 * Any of a school's intake addresses, with its settings (migration 051).
 * 'school' and 'division' are the system addresses; 'list' ones are added
 * by admins, one per mailing list.
 */
export interface IntakeAddress {
  id: string;
  token: string;
  kind: "school" | "division" | "list";
  divisionId: string | null;
  label: string | null;
  enabled: boolean;
  /** null = all parents. */
  visibleGrades: string[] | null;
  /** null = any sender. */
  allowedSenders: string[] | null;
  defaultFolderId: string | null;
  createdAt: string;
}

export interface InboundAddresses {
  wholeSchoolToken: string | null;
  divisionAddresses: DivisionAddress[];
  divisions: EventCalendar[];
  /** Every address that isn't deleted, in sortIntakeAddresses order. */
  addresses: IntakeAddress[];
}

export const INTAKE_ADDRESS_COLUMNS =
  "id, token, kind, division_id, label, enabled, visible_grades, allowed_senders, default_folder_id, created_at, deleted_at";

interface AddressRow {
  id: string;
  token: string;
  kind?: string | null;
  division_id: string | null;
  label?: string | null;
  enabled?: boolean | null;
  visible_grades?: string[] | null;
  allowed_senders?: string[] | null;
  default_folder_id?: string | null;
  created_at?: string;
  /** Set when an admin deleted the address (migration 053). */
  deleted_at?: string | null;
}

export function toIntakeAddress(row: AddressRow): IntakeAddress {
  const kind =
    row.kind === "list" ? "list" : row.division_id ? "division" : "school";
  return {
    id: row.id,
    token: row.token,
    kind,
    divisionId: row.division_id,
    label: row.label ?? null,
    enabled: row.enabled !== false,
    visibleGrades: row.visible_grades?.length ? row.visible_grades : null,
    allowedSenders: row.allowed_senders?.length ? row.allowed_senders : null,
    defaultFolderId: row.default_folder_id ?? null,
    createdAt: row.created_at ?? "",
  };
}

const gradeIndex = (grade: string) => {
  const i = GRADE_VALUES.indexOf(grade);
  return i === -1 ? GRADE_VALUES.length : i;
};

/** The address's grades as positions in GRADE_VALUES, lowest first. */
const gradeRange = (a: IntakeAddress) => (a.visibleGrades ?? []).map(gradeIndex).sort((x, y) => x - y);

/**
 * Where an address sorts, by who it's for (not by its name):
 *   0  the whole-school address;
 *   1  divisions: the division addresses, then lists for two or more grades;
 *   2  lists for a single grade;
 *   3  other lists (for all parents).
 */
function sortGroup(a: IntakeAddress): 0 | 1 | 2 | 3 {
  if (a.kind === "school") return 0;
  if (a.kind === "division") return 1;
  const grades = a.visibleGrades?.length ?? 0;
  return grades >= 2 ? 1 : grades === 1 ? 2 : 3;
}

const byName = (a: IntakeAddress, b: IntakeAddress) =>
  (a.label ?? a.token).localeCompare(b.label ?? b.token, undefined, { sensitivity: "base", numeric: true });

/**
 * Admin order: the whole school; then divisions (the system division
 * addresses in division order, then lists for several grades by lowest
 * grade, highest grade and name); then single-grade lists by grade; then
 * every other list by name. Ties go to the older address.
 */
export function sortIntakeAddresses(
  addresses: IntakeAddress[],
  divisions: Pick<EventCalendar, "id">[] = []
): IntakeAddress[] {
  const divisionOrder = new Map(divisions.map((d, i) => [d.id, i]));
  const divisionIndex = (a: IntakeAddress) => divisionOrder.get(a.divisionId ?? "") ?? divisions.length;

  const compare = (a: IntakeAddress, b: IntakeAddress): number => {
    const group = sortGroup(a) - sortGroup(b);
    if (group) return group;
    if (a.kind === "division" || b.kind === "division") {
      if (a.kind !== b.kind) return a.kind === "division" ? -1 : 1;
      return divisionIndex(a) - divisionIndex(b);
    }
    const [ra, rb] = [gradeRange(a), gradeRange(b)];
    if (ra.length && rb.length) {
      const lowest = ra[0] - rb[0];
      if (lowest) return lowest;
      const highest = ra[ra.length - 1] - rb[rb.length - 1];
      if (highest) return highest;
    }
    return byName(a, b);
  };

  return [...addresses].sort((a, b) => compare(a, b) || a.createdAt.localeCompare(b.createdAt));
}

/**
 * The admin list's two sections, each in sortIntakeAddresses order: the
 * addresses that are on, and the switched-off ones (shown collapsed).
 */
export function splitIntakeAddresses(
  addresses: IntakeAddress[],
  divisions: Pick<EventCalendar, "id">[] = []
): { enabled: IntakeAddress[]; switchedOff: IntakeAddress[] } {
  const sorted = sortIntakeAddresses(addresses, divisions);
  return {
    enabled: sorted.filter((a) => a.enabled),
    switchedOff: sorted.filter((a) => !a.enabled),
  };
}

/**
 * The summary the settings page and actions return, from address rows.
 * Deleted addresses are left out.
 */
export function summarizeAddresses(
  rows: AddressRow[],
  divisions: EventCalendar[]
): InboundAddresses {
  const addresses = sortIntakeAddresses(
    rows.filter((row) => !row.deleted_at).map(toIntakeAddress),
    divisions
  );
  return {
    wholeSchoolToken: addresses.find((a) => a.kind === "school")?.token ?? null,
    divisionAddresses: addresses
      .filter((a) => a.kind === "division")
      .map((a) => ({ id: a.id, token: a.token, divisionId: a.divisionId! })),
    divisions,
    addresses,
  };
}

/**
 * A school with email ingestion has one address for the whole school and one
 * per division (Lower, Middle, Upper School). Creates whatever is missing —
 * the divisions themselves too, if the school has none yet — and returns the
 * full set, without deleted addresses. A division address an admin deleted
 * still counts as there, so it isn't created again. Runs as the signed-in
 * admin, so RLS still applies.
 */
export async function ensureInboundAddresses(
  supabase: SupabaseClient,
  schoolId: string
): Promise<InboundAddresses> {
  const { data: found, error: divisionsError } = await supabase
    .from("event_calendars")
    .select("*")
    .eq("school_id", schoolId)
    .eq("kind", "division")
    .order("sort_order", { ascending: true });
  if (divisionsError) throw new Error(divisionsError.message);

  let divisions = found;

  if (!divisions?.length) {
    const { data: created, error } = await supabase
      .from("event_calendars")
      .insert(
        DEFAULT_DIVISIONS.map((d, i) => ({
          school_id: schoolId,
          kind: "division",
          name: d.name,
          color: d.color,
          sort_order: i,
        }))
      )
      .select("*");
    if (error) throw new Error(error.message);
    divisions = created;
  }

  const readAddresses = () =>
    supabase
      .from("email_ingestion_addresses")
      .select(INTAKE_ADDRESS_COLUMNS)
      .eq("school_id", schoolId)
      .order("created_at", { ascending: true })
      .returns<AddressRow[]>();

  const { data: existing, error: readError } = await readAddresses();
  if (readError) throw new Error(readError.message);

  // List addresses also have no division, so the whole-school one is found
  // by its kind. Deleted rows are included on purpose: a deleted division
  // address keeps its slot (and the unique index would refuse a second).
  const isSystemFor = (a: AddressRow, divisionId: string | null) =>
    divisionId === null
      ? a.division_id === null && a.kind !== "list"
      : a.division_id === divisionId;
  const missing = [null, ...(divisions ?? []).map((d) => d.id as string)]
    .filter((divisionId) => !(existing ?? []).some((a) => isSystemFor(a, divisionId)))
    .map((divisionId) => ({
      school_id: schoolId,
      division_id: divisionId,
      kind: divisionId ? "division" : "school",
      token: generateInboundToken(),
    }));

  let addresses = existing ?? [];
  if (missing.length) {
    // Another request may have created some of these first; the unique
    // indexes turn those away, and the re-read below picks up theirs.
    for (const row of missing) {
      await supabase.from("email_ingestion_addresses").insert(row);
    }
    const { data: reread, error } = await readAddresses();
    if (error) throw new Error(error.message);
    addresses = reread ?? [];
  }

  return summarizeAddresses(addresses, (divisions ?? []) as EventCalendar[]);
}
