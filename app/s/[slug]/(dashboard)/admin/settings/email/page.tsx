import { requireSchoolContext } from "@/lib/school-context";
import { PageTransition } from "@/components/motion";
import { EmailIngestionSection } from "@/components/admin/settings/email-ingestion";
import { SettingsPageHeader } from "@/components/admin/settings/settings-header";
import { loadInboundAddresses, loadRecentEmails } from "../data";

// Server actions run within their page's limit; this is the limit the single
// Settings page had (e.g. website "Sync now" keeps crawling via after()).
export const maxDuration = 300;

export default async function EmailSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { school } = await requireSchoolContext(slug);
  const [recentEmails, inboundAddresses] = await Promise.all([
    loadRecentEmails(school.id),
    loadInboundAddresses(school.id, school.email_ingestion_enabled ?? false),
  ]);

  return (
    <PageTransition>
      <div className="mx-auto max-w-2xl space-y-8 pb-8">
        <SettingsPageHeader slug={slug} section="email" title={false} />
        <EmailIngestionSection
          schoolId={school.id}
          config={{
            enabled: school.email_ingestion_enabled ?? false,
            autoSort: school.auto_sort_enabled ?? true,
            ...inboundAddresses,
            inboundDomain: process.env.INBOUND_EMAIL_DOMAIN ?? null,
            recent: recentEmails,
          }}
        />
      </div>
    </PageTransition>
  );
}
