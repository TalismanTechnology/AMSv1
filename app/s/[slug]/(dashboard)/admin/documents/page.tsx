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

  const [{ data: documents }, { data: categories }, { data: folders }] =
    await Promise.all([
      supabase
        .from("documents")
        .select("*, category:categories(*)")
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
    ]);

  return (
    <PageTransition>
      <DocumentsClient
        documents={documents || []}
        categories={categories || []}
        folders={folders || []}
        schoolId={school.id}
        schoolSlug={slug}
      />
    </PageTransition>
  );
}
