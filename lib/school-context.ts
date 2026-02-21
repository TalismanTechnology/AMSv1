import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect, notFound } from "next/navigation";
import { cache } from "react";
import type { School, SchoolMembership, UserRole } from "@/lib/types";

/**
 * Resolve a school from its slug. Cached per request.
 * Uses admin client because this is called on public pages (login/register)
 * where the user may not be authenticated yet.
 */
export const getSchoolBySlug = cache(
  async (slug: string): Promise<School | null> => {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("schools")
      .select("*")
      .eq("slug", slug)
      .single();
    return data;
  }
);

/**
 * Get the current user's membership for a specific school. Cached per request.
 */
export const getUserSchoolMembership = cache(
  async (
    userId: string,
    schoolId: string
  ): Promise<SchoolMembership | null> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("school_memberships")
      .select("*")
      .eq("user_id", userId)
      .eq("school_id", schoolId)
      .single();
    return data;
  }
);

/**
 * Get all schools a user belongs to (for school switcher).
 */
export const getUserSchools = cache(
  async (userId: string): Promise<SchoolMembership[]> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("school_memberships")
      .select("*, school:schools(*)")
      .eq("user_id", userId);
    return data || [];
  }
);

export interface SchoolContext {
  user: { id: string; email?: string };
  school: School;
  role: UserRole;
  isSuperAdmin: boolean;
}

/**
 * Require school context: resolve slug, verify membership, return school + role.
 * Redirects if school not found or user not a member.
 */
export async function requireSchoolContext(
  slug: string
): Promise<SchoolContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/s/${slug}/login`);
  }

  const school = await getSchoolBySlug(slug);
  if (!school) {
    notFound();
  }

  // Super admins have access to all schools as admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role === "super_admin") {
    return { user, school, role: "admin" as const, isSuperAdmin: true };
  }

  const membership = await getUserSchoolMembership(user.id, school.id);
  if (!membership) {
    redirect("/");
  }

  return {
    user,
    school,
    role: membership.role as UserRole,
    isSuperAdmin: false,
  };
}
