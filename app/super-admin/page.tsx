import { createClient } from "@/lib/supabase/server";
import { SuperAdminClient } from "./client";

export default async function SuperAdminPage() {
  const supabase = await createClient();

  const { data: schools } = await supabase
    .from("schools")
    .select("*, school_memberships(count)")
    .order("created_at", { ascending: false });

  return <SuperAdminClient schools={schools || []} />;
}
