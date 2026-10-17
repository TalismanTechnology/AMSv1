import { requireSchoolContext } from "@/lib/school-context";
import { getInsightsData } from "@/actions/insights";
import { parseRangeDays } from "@/lib/insights/aggregate";
import { InsightsClient } from "./client";
import { PageTransition } from "@/components/motion";

export default async function InsightsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { slug } = await params;
  const { range } = await searchParams;
  const { school } = await requireSchoolContext(slug);

  // Also kicks off background topic labeling (after()) when the range has
  // questions without a topic yet; the page renders from what's cached.
  const data = await getInsightsData(school.id, parseRangeDays(range));

  return (
    <PageTransition>
      <InsightsClient data={data} schoolId={school.id} schoolSlug={slug} />
    </PageTransition>
  );
}
