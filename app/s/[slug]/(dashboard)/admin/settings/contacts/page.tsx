import { requireSchoolContext } from "@/lib/school-context";
import { PageTransition } from "@/components/motion";
import { ContactsDirectory } from "@/components/admin/contacts-directory";
import { SettingsPageHeader } from "@/components/admin/settings/settings-header";
import { loadContacts } from "../data";

// Server actions run within their page's limit; this is the limit the single
// Settings page had (e.g. website "Sync now" keeps crawling via after()).
export const maxDuration = 300;

export default async function ContactsSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { school } = await requireSchoolContext(slug);
  const contacts = await loadContacts(school.id);

  return (
    <PageTransition>
      <div className="mx-auto max-w-2xl space-y-8 pb-8">
        <SettingsPageHeader slug={slug} section="contacts" title={false} />
        <ContactsDirectory schoolId={school.id} data={contacts} />
      </div>
    </PageTransition>
  );
}
