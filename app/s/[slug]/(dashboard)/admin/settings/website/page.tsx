import { requireSchoolContext } from "@/lib/school-context";
import { PageTransition } from "@/components/motion";
import { WebsiteSources } from "@/components/admin/website-sources";
import { SettingsPageHeader } from "@/components/admin/settings/settings-header";
import { loadWebsiteSources } from "../data";

// Server actions run within their page's limit; this is the limit the single
// Settings page had (e.g. website "Sync now" keeps crawling via after()).
export const maxDuration = 300;

export default async function WebsiteSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { school } = await requireSchoolContext(slug);
  const websiteSources = await loadWebsiteSources(school.id);

  return (
    <PageTransition>
      <div className="mx-auto max-w-2xl space-y-8 pb-8">
        <SettingsPageHeader slug={slug} section="website" title={false} />
        <WebsiteSources
          schoolId={school.id}
          sources={websiteSources.sources}
          loadError={websiteSources.loadError}
        />
      </div>
    </PageTransition>
  );
}
