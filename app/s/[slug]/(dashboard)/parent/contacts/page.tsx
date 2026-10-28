import { createClient } from "@/lib/supabase/server";
import { requireSchoolContext } from "@/lib/school-context";
import { loadParentContacts } from "@/lib/contacts/parent-directory";
import { ParentContactsClient } from "./client";
import { PageTransition } from "@/components/motion";

// The staff directory for parents, beside Documents. Same access as the
// Documents page: school membership (requireSchoolContext) and onboarding
// (the parent layout). Read with the parent's own client, so RLS only lets
// approved contacts through; loadParentContacts filters to approved as well.
export default async function ParentContactsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { school } = await requireSchoolContext(slug);

  const supabase = await createClient();
  const [{ contacts, folders }, { data: divisions }] = await Promise.all([
    loadParentContacts(supabase, school.id),
    supabase
      .from("event_calendars")
      .select("id, name")
      .eq("school_id", school.id)
      .eq("kind", "division")
      .order("sort_order"),
  ]);

  return (
    <PageTransition>
      <ParentContactsClient
        contacts={contacts}
        folders={folders}
        divisions={divisions ?? []}
      />
    </PageTransition>
  );
}
