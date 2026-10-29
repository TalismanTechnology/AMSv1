import { requireSchoolContext } from "@/lib/school-context";
import { getAnalyticsData } from "@/actions/analytics";
import { parseMetricRange } from "@/lib/metrics/windows";
import { AnalyticsClient } from "./client";
import { PageTransition } from "@/components/motion";

export default async function AnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ range?: string | string[] }>;
}) {
  const { slug } = await params;
  const { range } = await searchParams;
  const { school } = await requireSchoolContext(slug);

  // Also kicks off background topic labeling (after()) when the range has
  // questions without a topic yet; the page renders from what's cached.
  const data = await getAnalyticsData(school.id, parseMetricRange(range));

  return (
    <PageTransition>
      <AnalyticsClient data={data} schoolId={school.id} schoolSlug={slug} />
    </PageTransition>
  );
}
