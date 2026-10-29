import { permanentRedirect } from "next/navigation";

// Insights is now the "Topics & questions" section of Analytics.
export default async function InsightsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      query.append(key, v);
    }
  }
  const qs = query.toString();
  permanentRedirect(`/s/${encodeURIComponent(slug)}/admin/analytics${qs ? `?${qs}` : ""}#topics`);
}
