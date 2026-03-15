import { requireSchoolContext } from "@/lib/school-context";
import { getLatestAudit } from "@/actions/document-audit";
import { DocumentAuditClient } from "./client";
import { PageTransition } from "@/components/motion";

export default async function DocumentAuditPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { school } = await requireSchoolContext(slug);

  const audit = await getLatestAudit(school.id);

  return (
    <PageTransition>
      <DocumentAuditClient
        audit={audit}
        schoolId={school.id}
        schoolSlug={slug}
      />
    </PageTransition>
  );
}
