import { requireSchoolContext } from "@/lib/school-context";
import { PageTransition } from "@/components/motion";
import { EmailIngestionSection } from "@/components/admin/settings/email-ingestion";
import { ContentPageHeader } from "@/components/admin/settings/settings-header";
import { loadInboundAddresses, loadRecentEmails } from "../settings/data";

// Server actions run within their page's limit; this is the limit the single
// Settings page had (e.g. website "Sync now" keeps crawling via after()).
export const maxDuration = 300;

// Email intake, formerly Settings › Email intake (/admin/settings/email still
// forwards here).
export default async function EmailIntakePage({
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
        <ContentPageHeader page="email-intake" />
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
