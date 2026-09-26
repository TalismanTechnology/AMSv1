import { createClient } from "@/lib/supabase/server";
import { requireSchoolContext } from "@/lib/school-context";
import { UsersClient } from "./client";
import { PageTransition } from "@/components/motion";

export default async function UsersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { school, user } = await requireSchoolContext(slug);

  const supabase = await createClient();

  const { data: rawUsers } = await supabase
    .from("profiles")
    .select("*, children(*), school_memberships!inner(school_id, approved, role)")
    .eq("school_memberships.school_id", school.id)
    .neq("id", user.id)
    .order("created_at", { ascending: false });

  // Map membership-level approved/role onto the profile for display
  const users = (rawUsers || []).map((u) => {
    const membership = Array.isArray(u.school_memberships)
      ? u.school_memberships[0]
      : u.school_memberships;
    return {
      ...u,
      approved: membership?.approved ?? u.approved,
      role: membership?.role ?? u.role,
    };
  });

  return (
    <PageTransition>
      <UsersClient
        users={users}
        schoolId={school.id}
        schoolSlug={slug}
      />
    </PageTransition>
  );
}
