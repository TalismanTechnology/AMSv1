import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_DIVISIONS } from "@/lib/documents/division-categories";
import { generateInboundToken } from "@/lib/email/token";
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
  /** Every address: whole school first, then divisions, then lists. */
  addresses: IntakeAddress[];
}

export const INTAKE_ADDRESS_COLUMNS =
  "id, token, kind, division_id, label, enabled, visible_grades, allowed_senders, default_folder_id, created_at";

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
}

const KIND_ORDER = { school: 0, division: 1, list: 2 } as const;

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

/** Whole school, divisions (in division order), then lists by creation. */
export function sortIntakeAddresses(
  addresses: IntakeAddress[],
  divisions: Pick<EventCalendar, "id">[] = []
): IntakeAddress[] {
  const divisionOrder = new Map(divisions.map((d, i) => [d.id, i]));
  return [...addresses].sort(
    (a, b) =>
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      (divisionOrder.get(a.divisionId ?? "") ?? 0) - (divisionOrder.get(b.divisionId ?? "") ?? 0) ||
      a.createdAt.localeCompare(b.createdAt)
  );
}

/** The summary the settings page and actions return, from address rows. */
export function summarizeAddresses(
  rows: AddressRow[],
  divisions: EventCalendar[]
): InboundAddresses {
  const addresses = sortIntakeAddresses(rows.map(toIntakeAddress), divisions);
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
 * full set. Runs as the signed-in admin, so RLS still applies.
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
  // by its kind.
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
