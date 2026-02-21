import { createClient } from "@/lib/supabase/server";
import { requireSchoolContext } from "@/lib/school-context";
import { ProfileClient } from "./client";
import { PageTransition } from "@/components/motion";

export default async function ParentProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { user, school } = await requireSchoolContext(slug);

  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const { data: children } = await supabase
    .from("children")
    .select("*")
    .eq("parent_id", user.id)
    .eq("school_id", school.id)
    .order("created_at", { ascending: true });

  return (
    <PageTransition>
      <ProfileClient
        profile={profile!}
        children={children || []}
        email={user.email || ""}
        schoolId={school.id}
        schoolSlug={slug}
      />
    </PageTransition>
  );
}
