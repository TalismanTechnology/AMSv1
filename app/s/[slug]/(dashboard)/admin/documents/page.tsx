import { createClient } from "@/lib/supabase/server";
import { requireSchoolContext } from "@/lib/school-context";
import { DocumentsClient } from "./client";
import { PageTransition } from "@/components/motion";

export default async function DocumentsPage({
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
        .select(
          "*, category:categories(*), divisions:event_calendars(id, school_id, kind, name, color, sort_order, created_at)"
        )
        .eq("school_id", school.id)
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
      supabase
        .from("event_calendars")
        .select("*")
        .eq("school_id", school.id)
        .eq("kind", "division")
        .order("sort_order"),
    ]);

  return (
    <PageTransition>
      <DocumentsClient
        documents={documents || []}
        categories={categories || []}
        folders={folders || []}
        divisions={divisions || []}
        schoolId={school.id}
        schoolSlug={slug}
        autoSortEnabled={school.auto_sort_enabled ?? true}
      />
    </PageTransition>
  );
}
