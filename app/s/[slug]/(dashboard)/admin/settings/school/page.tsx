import { requireSchoolContext } from "@/lib/school-context";
import { loadSettings } from "@/lib/settings";
import { PageTransition } from "@/components/motion";
import { SchoolSettings } from "@/components/admin/settings/general-settings";

// Server actions run within their page's limit; this is the limit the single
// Settings page had (e.g. website "Sync now" keeps crawling via after()).
export const maxDuration = 300;

export default async function SchoolSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { school } = await requireSchoolContext(slug);
  const settings = await loadSettings(school.id);

  return (
    <PageTransition>
      <SchoolSettings settings={settings} schoolId={school.id} schoolSlug={slug} />
    </PageTransition>
  );
}
