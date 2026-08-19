import { createClient } from "@/lib/supabase/server";

// Shared authorization gate for server actions that mutate one school's
// configuration. Always re-authorizes against the SPECIFIC school id passed in
// — the client supplies that id, so being an admin of some other school must
// never be sufficient.

export interface SchoolAdmin {
  userId: string;
}

export type SchoolAdminResult = SchoolAdmin | { error: string };

export async function requireSchoolAdmin(
  schoolId: string
): Promise<SchoolAdminResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role === "super_admin") return { userId: user.id };

  const { data: membership } = await supabase
    .from("school_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("school_id", schoolId)
    .single();

  if (membership?.role !== "admin") {
    return { error: "You do not have permission to manage this school" };
  }

  return { userId: user.id };
}
