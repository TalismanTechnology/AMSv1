import type { SupabaseClient } from "@supabase/supabase-js";

// The columns a label row is selected with everywhere it's read.
export const LABEL_COLUMNS = "id, school_id, name, color, sort_order, created_at";

/**
 * The label id as it should be stored: kept only if it's this school's label.
 * Malformed ids are dropped before the query rather than sent to Postgres,
 * which would reject them as invalid uuids.
 */
export async function schoolLabelId(
  supabase: SupabaseClient,
  schoolId: string,
  labelId: string | null | undefined
): Promise<string | null> {
  if (!labelId || !UUID_PATTERN.test(labelId)) return null;
  const { data, error } = await supabase
    .from("calendar_labels")
    .select("id")
    .eq("id", labelId)
    .eq("school_id", schoolId)
    .maybeSingle();
  if (error) throw new Error(`Failed to check label: ${error.message}`);
  return data?.id ?? null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
