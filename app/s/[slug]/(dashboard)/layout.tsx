import { requireSchoolContext, getUserSchools } from "@/lib/school-context";
import { SchoolProvider } from "@/components/shared/school-context";
import { loadSettings } from "@/lib/settings";

export default async function SchoolDashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { user, school, role, isSuperAdmin } =
    await requireSchoolContext(slug);
  const [memberships, settings] = await Promise.all([
    getUserSchools(user.id),
    loadSettings(school.id),
  ]);

  return (
    <SchoolProvider
      school={school}
      role={role}
      isSuperAdmin={isSuperAdmin}
      memberships={memberships}
      disableAnimations={settings.disable_animations}
    >
      {children}
    </SchoolProvider>
  );
}
