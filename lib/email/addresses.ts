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

export interface InboundAddresses {
  wholeSchoolToken: string | null;
  divisionAddresses: DivisionAddress[];
  divisions: EventCalendar[];
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
      .select("id, token, division_id")
      .eq("school_id", schoolId)
      .order("created_at", { ascending: true });

  const { data: existing, error: readError } = await readAddresses();
  if (readError) throw new Error(readError.message);

  const missing = [null, ...(divisions ?? []).map((d) => d.id as string)]
    .filter((divisionId) => !(existing ?? []).some((a) => a.division_id === divisionId))
    .map((divisionId) => ({
      school_id: schoolId,
      division_id: divisionId,
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

  return {
    wholeSchoolToken: addresses.find((a) => a.division_id === null)?.token ?? null,
    divisionAddresses: addresses
      .filter((a) => a.division_id !== null)
      .map((a) => ({ id: a.id, token: a.token, divisionId: a.division_id })),
    divisions: (divisions ?? []) as EventCalendar[],
  };
}
