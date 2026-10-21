import { requireSchoolContext } from "@/lib/school-context";
import { redirect } from "next/navigation";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { MobileHeader } from "@/components/admin/mobile-header";
import { SidebarProvider } from "@/components/admin/sidebar-context";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createAdminClient } from "@/lib/supabase/admin";
import { countOpenConflicts } from "@/lib/conflicts/store";

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { school, role, isSuperAdmin } = await requireSchoolContext(slug);

  if (role !== "admin" && !isSuperAdmin) {
    redirect(`/s/${slug}/parent/chat`);
  }

  // One head-only count for the Conflicts badge; null (no badge) until
  // migration 046 is applied or if the count fails.
  const openConflicts = await countOpenConflicts(createAdminClient(), school.id);

  return (
    <SidebarProvider badges={openConflicts ? { conflicts: openConflicts } : undefined}>
      <TooltipProvider>
        <div className="flex h-dvh">
          <AdminSidebar />
          <div className="flex flex-1 flex-col overflow-hidden">
            <MobileHeader />
            <main className="dashboard-cards flex-1 overflow-auto p-4 md:p-8">
              {children}
            </main>
          </div>
        </div>
      </TooltipProvider>
    </SidebarProvider>
  );
}
