import { createClient } from "@/lib/supabase/server";
import { requireSchoolContext } from "@/lib/school-context";
import { ParentAnnouncementsClient } from "./client";
import { PageTransition } from "@/components/motion";

export default async function ParentAnnouncementsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { school } = await requireSchoolContext(slug);

  const supabase = await createClient();

  const now = new Date().toISOString();

  const { data: announcements } = await supabase
    .from("announcements")
    .select("*")
    .eq("school_id", school.id)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false });

  return (
    <PageTransition>
      <ParentAnnouncementsClient announcements={announcements || []} />
    </PageTransition>
  );
}
