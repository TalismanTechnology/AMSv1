import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSchoolContext } from "@/lib/school-context";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AnnouncementBanner } from "@/components/parent/announcement-banner";
import { ParentSidebarProvider } from "@/components/parent/sidebar-context";
import { ParentSidebar } from "@/components/parent/parent-sidebar";
import { ParentMobileHeader } from "@/components/parent/mobile-header";

export default async function ParentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { user, school, role } = await requireSchoolContext(slug);

  const supabase = await createClient();

  // Profile, banner announcements (pinned or urgent, non-expired) and the
  // user's dismissals are independent, so fetch them in one round trip.
  const now = new Date().toISOString();
  const [
    { data: profile },
    { data: bannerAnnouncements },
    { data: dismissals },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, onboarding_completed")
      .eq("id", user.id)
      .single(),
    supabase
      .from("announcements")
      .select("id, title, content, priority")
      .eq("school_id", school.id)
      .or("pinned.eq.true,priority.eq.urgent")
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("announcement_dismissals")
      .select("announcement_id")
      .eq("user_id", user.id),
  ]);

  // Onboarding is required, so it is enforced here rather than by a link the
  // parent could route around. Admins viewing the parent surface are exempt —
  // they have no children to record.
  if (role === "parent" && !profile?.onboarding_completed) {
    redirect(`/s/${slug}/welcome`);
  }

  const dismissedIds = new Set(
    (dismissals || []).map(
      (d: { announcement_id: string }) => d.announcement_id
    )
  );
  const visibleBanner = (bannerAnnouncements || []).filter(
    (a: { id: string }) => !dismissedIds.has(a.id)
  );

  return (
    <ParentSidebarProvider
      userName={profile?.full_name || user.email || ""}
    >
      <TooltipProvider>
        <div className="flex h-dvh">
          <ParentSidebar />
          <div className="flex flex-1 flex-col overflow-hidden">
            <ParentMobileHeader />
            {visibleBanner.length > 0 && (
              <AnnouncementBanner announcements={visibleBanner} />
            )}
            <main className="dashboard-cards flex-1 overflow-auto basis-0">{children}</main>
          </div>
        </div>
      </TooltipProvider>
    </ParentSidebarProvider>
  );
}
