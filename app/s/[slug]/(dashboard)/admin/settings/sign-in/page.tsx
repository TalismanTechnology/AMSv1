import { requireSchoolContext } from "@/lib/school-context";
import { PageTransition } from "@/components/motion";
import { ParentSignInSettings } from "@/components/admin/parent-sign-in-settings";
import { SettingsPageHeader } from "@/components/admin/settings/settings-header";
import { loadParentSignInConfig } from "../data";

// Server actions run within their page's limit; this is the limit the single
// Settings page had (e.g. website "Sync now" keeps crawling via after()).
export const maxDuration = 300;

export default async function SignInSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { school, isSuperAdmin } = await requireSchoolContext(slug);
  const parentSignIn = await loadParentSignInConfig(school);

  return (
    <PageTransition>
      <div className="mx-auto max-w-2xl space-y-8 pb-8">
        <SettingsPageHeader slug={slug} section="sign-in" title={false} />
        <ParentSignInSettings
          schoolId={school.id}
          config={parentSignIn}
          isSuperAdmin={isSuperAdmin}
        />
      </div>
    </PageTransition>
  );
}
