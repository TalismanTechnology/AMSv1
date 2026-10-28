import { requireSchoolContext } from "@/lib/school-context";
import { PageTransition } from "@/components/motion";
import { ContactsDirectory } from "@/components/admin/contacts-directory";
import { ContentPageHeader } from "@/components/admin/settings/settings-header";
import { loadContacts } from "../settings/data";

// Server actions run within their page's limit; this is the limit the single
// Settings page had (e.g. website "Sync now" keeps crawling via after()).
export const maxDuration = 300;

// Staff contacts, formerly Settings › Staff contacts (/admin/settings/contacts
// still forwards here).
export default async function ContactsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { school } = await requireSchoolContext(slug);
  const contacts = await loadContacts(school.id);

  return (
    <PageTransition>
      <div className="mx-auto max-w-6xl space-y-6 pb-8">
        <ContentPageHeader page="contacts" />
        <ContactsDirectory schoolId={school.id} data={contacts} />
      </div>
    </PageTransition>
  );
}
