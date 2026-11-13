import { createClient } from "@/lib/supabase/server";
import { schoolAccessFor } from "@/lib/school-lock/access";
import { SCHOOL_LOCKED_ERROR } from "@/lib/school-lock/core";

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

  const { data: membership } = await supabase
    .from("school_memberships")
    .select("role, approved")
    .eq("user_id", user.id)
    .eq("school_id", schoolId)
    .maybeSingle();

  if (profile?.role === "super_admin") {
    // Allowed unless the school's owner lock keeps them out.
    const access = await schoolAccessFor({
      userId: user.id,
      schoolId,
      isSuperAdmin: true,
      membership: membership ?? null,
      need: "admin",
    });
    if (access === "locked") return { error: SCHOOL_LOCKED_ERROR };
    return { userId: user.id };
  }

  if (membership?.role !== "admin") {
    return { error: "You do not have permission to manage this school" };
  }

  return { userId: user.id };
}

// Platform-wide gate for school settings that can lock every parent out of a
// school (parent sign-in provider, turning on require-roster-match). School
// admins can see these settings but not change them.
export async function requireSuperAdmin(): Promise<SchoolAdminResult> {
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

  if (profile?.role !== "super_admin") {
    return { error: "Only AskMySchool support can change how parents sign in" };
  }

  return { userId: user.id };
}
