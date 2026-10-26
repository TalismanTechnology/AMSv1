import { requireSchoolContext } from "@/lib/school-context";
import { PageTransition } from "@/components/motion";
import { BlackbaudSection } from "@/components/admin/settings/blackbaud-settings";
import { SettingsPageHeader } from "@/components/admin/settings/settings-header";
import { loadBlackbaudConfig, parseCallbackResult } from "../data";

// Server actions run within their page's limit; this is the limit the single
// Settings page had (e.g. website "Sync now" keeps crawling via after()).
export const maxDuration = 300;

export default async function BlackbaudSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ blackbaud?: string }>;
}) {
  const { slug } = await params;
  const { blackbaud } = await searchParams;
  const { school } = await requireSchoolContext(slug);
  const config = await loadBlackbaudConfig(
    school.id,
    school.blackbaud_verification_enabled ?? false
  );

  return (
    <PageTransition>
      <div className="mx-auto max-w-2xl space-y-8 pb-8">
        <SettingsPageHeader slug={slug} section="blackbaud" title={false} />
        <BlackbaudSection
          schoolId={school.id}
          schoolSlug={slug}
          config={config}
          callback={parseCallbackResult(blackbaud)}
        />
      </div>
    </PageTransition>
  );
}
