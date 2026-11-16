import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * Chat retrieval is scoped to a viewer (migration 051). The evals read the
 * whole library, as a super-admin does.
 */
export async function evalViewerId(supabase: ReturnType<typeof createAdminClient>): Promise<string> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "super_admin")
    .limit(1)
    .maybeSingle();
  if (error || !data) throw new Error(`No super-admin to evaluate as: ${error?.message ?? "none found"}`);
  return data.id as string;
}
