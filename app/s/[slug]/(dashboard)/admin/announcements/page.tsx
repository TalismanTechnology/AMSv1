import { createClient } from "@/lib/supabase/server";
import { requireSchoolContext } from "@/lib/school-context";
import { AnnouncementsClient } from "./client";
import { PageTransition } from "@/components/motion";

export default async function AnnouncementsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { school } = await requireSchoolContext(slug);

  const supabase = await createClient();

  const { data: announcements } = await supabase
    .from("announcements")
    .select("*")
    .eq("school_id", school.id)
    .order("created_at", { ascending: false });

  return (
    <PageTransition>
      <AnnouncementsClient
        announcements={announcements || []}
        schoolId={school.id}
        schoolSlug={slug}
      />
    </PageTransition>
  );
}
