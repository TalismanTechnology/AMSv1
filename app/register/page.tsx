import { createAdminClient } from "@/lib/supabase/admin";
import { RegisterForm } from "./register-form";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  // Use admin client because this is a public page — unauthenticated users
  // need to see the list of schools to register.
  const supabase = createAdminClient();

  // Only show schools that allow open registration (no join code required)
  const { data: allSchools } = await supabase
    .from("schools")
    .select("id, slug, name")
    .order("name");

  const { data: settingsRows } = await supabase
    .from("settings")
    .select("school_id, require_join_code");

  const codeRequired = new Set(
    (settingsRows ?? [])
      .filter((s) => s.require_join_code)
      .map((s) => s.school_id)
  );

  const openSchools = (allSchools ?? []).filter((s) => !codeRequired.has(s.id));

  return <RegisterForm schools={openSchools} />;
}
