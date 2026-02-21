import { requireSchoolContext } from "@/lib/school-context";
import { getAnalyticsData } from "@/actions/analytics";
import { AnalyticsClient } from "./client";
import { PageTransition } from "@/components/motion";

export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { school } = await requireSchoolContext(slug);

  const data = await getAnalyticsData("30d", school.id);

  return (
    <PageTransition>
      <AnalyticsClient
        data={data}
        schoolId={school.id}
        schoolSlug={slug}
      />
    </PageTransition>
  );
}
