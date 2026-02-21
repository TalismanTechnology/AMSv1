import { requireSchoolContext } from "@/lib/school-context";
import { redirect } from "next/navigation";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { MobileHeader } from "@/components/admin/mobile-header";
import { SidebarProvider } from "@/components/admin/sidebar-context";
import { TooltipProvider } from "@/components/ui/tooltip";

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { role, isSuperAdmin } = await requireSchoolContext(slug);

  if (role !== "admin" && !isSuperAdmin) {
    redirect(`/s/${slug}/parent`);
  }

  return (
    <SidebarProvider>
      <TooltipProvider>
        <div className="flex h-screen">
          <AdminSidebar />
          <div className="flex flex-1 flex-col overflow-hidden">
            <MobileHeader />
            <main className="flex-1 overflow-auto bg-background p-4 md:p-8">
              {children}
            </main>
          </div>
        </div>
      </TooltipProvider>
    </SidebarProvider>
  );
}
