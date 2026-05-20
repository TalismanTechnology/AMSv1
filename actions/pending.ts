"use server";

import { createClient } from "@/lib/supabase/server";
import { getSchoolBySlug } from "@/lib/school-context";

/**
 * Check whether the current user's membership for a school has been approved.
 * Used by the /pending page to poll for approval without a manual refresh.
 *
 * Returns `redirectTo` whenever the user should leave the pending page:
 * - approved member  → their dashboard
 * - super admin      → admin dashboard
 * - signed out       → login
 * - no school        → landing
 * Returns `redirectTo: null` while the membership is still pending.
 */
export async function checkApprovalStatus(
  slug: string
): Promise<{ approved: boolean; redirectTo: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { approved: false, redirectTo: `/s/${slug}/login` };
  }

  const school = await getSchoolBySlug(slug);
  if (!school) {
    return { approved: false, redirectTo: "/" };
  }

  // Super admins always have access
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role === "super_admin") {
    return { approved: true, redirectTo: `/s/${slug}/admin` };
  }

  const { data: membership } = await supabase
    .from("school_memberships")
    .select("role, approved")
    .eq("user_id", user.id)
    .eq("school_id", school.id)
    .single();

  if (!membership) {
    return { approved: false, redirectTo: null };
  }

  if (membership.approved) {
    return {
      approved: true,
      redirectTo:
        membership.role === "admin"
          ? `/s/${slug}/admin`
          : `/s/${slug}/parent`,
    };
  }

  return { approved: false, redirectTo: null };
}
