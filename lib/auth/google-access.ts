import { createAdminClient } from "@/lib/supabase/admin";
import type { StaffAccess } from "./google-sign-in";

// Loads what decideGoogleAccess (google-sign-in.ts) needs about a user. Read
// with the service role: the decision is made before (or instead of) handing
// the user a session, and must not depend on what RLS lets them see.

export async function loadStaffAccess(userId: string): Promise<StaffAccess> {
  const admin = createAdminClient();

  const [
    { data: profile, error: profileError },
    { data: memberships, error: membershipError },
    { data: parentMemberships, error: parentError },
  ] = await Promise.all([
    admin.from("profiles").select("role").eq("id", userId).maybeSingle(),
    admin
      .from("school_memberships")
      .select("schools(slug)")
      .eq("user_id", userId)
      .eq("role", "admin"),
    // Only approved memberships: the same rule as the parent password sign-in
    // (actions/auth.ts). Oldest first, so the landing school is stable.
    admin
      .from("school_memberships")
      .select("schools(slug)")
      .eq("user_id", userId)
      .eq("role", "parent")
      .eq("approved", true)
      .order("created_at", { ascending: true }),
  ]);

  const error = profileError ?? membershipError ?? parentError;
  if (error) {
    throw new Error(`Could not load staff access: ${error.message ?? "unknown error"}`);
  }

  return {
    profileRole: profile?.role ?? null,
    adminSchoolSlugs: slugsOf(memberships),
    parentSchoolSlugs: slugsOf(parentMemberships),
  };
}

function slugsOf(rows: { schools: unknown }[] | null): string[] {
  return (rows ?? [])
    .map((row) => (row.schools as { slug?: string } | null | undefined)?.slug)
    .filter((slug): slug is string => typeof slug === "string" && slug.length > 0);
}
