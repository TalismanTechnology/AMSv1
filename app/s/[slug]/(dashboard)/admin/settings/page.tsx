import { requireSchoolContext } from "@/lib/school-context";
import { loadSettings } from "@/lib/settings";
import { SettingsClient } from "./client";
import { PageTransition } from "@/components/motion";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { school } = await requireSchoolContext(slug);

  const settings = await loadSettings(school.id);

  return (
    <PageTransition>
      <SettingsClient
        settings={settings}
        schoolId={school.id}
        schoolSlug={slug}
        joinCode={school.join_code}
        emailIngestion={{
          enabled: school.email_ingestion_enabled ?? false,
          autoSort: school.auto_sort_enabled ?? true,
          allowedDomains: school.allowed_sender_domains ?? [],
          token: school.inbound_email_token ?? null,
          inboundDomain: process.env.INBOUND_EMAIL_DOMAIN ?? null,
        }}
      />
    </PageTransition>
  );
}
