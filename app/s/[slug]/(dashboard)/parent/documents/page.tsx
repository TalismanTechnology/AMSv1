import { createClient } from "@/lib/supabase/server";
import { requireSchoolContext } from "@/lib/school-context";
import { ParentDocumentsClient } from "./client";
import { PageTransition } from "@/components/motion";

export default async function ParentDocumentsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { school } = await requireSchoolContext(slug);

  const supabase = await createClient();

  const [
    { data: documents },
    { data: categories },
    { data: folders },
    { data: divisions },
  ] = await Promise.all([
      supabase
        .from("documents")
        .select("*, category:categories(*), folder:folders(*)")
        .eq("school_id", school.id)
        .eq("status", "ready")
        .order("created_at", { ascending: false }),
      supabase
        .from("categories")
        .select("*")
        .eq("school_id", school.id)
        .order("name"),
      supabase
        .from("folders")
        .select("*")
        .eq("school_id", school.id)
        .order("name"),
      // Categories are grouped under these once a school sorts by division.
      supabase
        .from("event_calendars")
        .select("*")
        .eq("school_id", school.id)
        .eq("kind", "division")
        .order("sort_order"),
    ]);

  return (
    <PageTransition>
      <ParentDocumentsClient
        documents={documents || []}
        categories={categories || []}
        folders={folders || []}
        divisions={divisions || []}
        schoolId={school.id}
      />
    </PageTransition>
  );
}
