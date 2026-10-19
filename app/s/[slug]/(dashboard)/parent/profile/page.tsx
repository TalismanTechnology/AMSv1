import { createClient } from "@/lib/supabase/server";
import { requireSchoolContext } from "@/lib/school-context";
import { resolveSchoolName } from "@/lib/school-display-name";
import { loadSettings } from "@/lib/settings";
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

  // No row (or migration 042 not applied yet) means the default: on.
  const [{ data: preferences }, settings] = await Promise.all([
    supabase
      .from("notification_preferences")
      .select("new_document_push")
      .eq("user_id", user.id)
      .maybeSingle(),
    loadSettings(school.id),
  ]);

  return (
    <PageTransition>
      <ProfileClient
        profile={profile!}
        initialChildren={children || []}
        email={user.email || ""}
        schoolId={school.id}
        schoolSlug={slug}
        schoolName={resolveSchoolName(school.name)}
        newDocumentPush={preferences?.new_document_push !== false}
        gradeRollover={{
          month: settings.grade_rollover_month,
          day: settings.grade_rollover_day,
        }}
      />
    </PageTransition>
  );
}
