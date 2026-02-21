import { createClient } from "@/lib/supabase/server";
import { requireSchoolContext } from "@/lib/school-context";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AnnouncementBanner } from "@/components/parent/announcement-banner";
import { OnboardingTour } from "@/components/parent/onboarding-tour";
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
  const { user, school } = await requireSchoolContext(slug);

  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, onboarding_completed")
    .eq("id", user.id)
    .single();

  // Fetch banner announcements (pinned or urgent, non-expired) for this school
  const now = new Date().toISOString();
  const { data: bannerAnnouncements } = await supabase
    .from("announcements")
    .select("id, title, content, priority")
    .eq("school_id", school.id)
    .or("pinned.eq.true,priority.eq.urgent")
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order("created_at", { ascending: false })
    .limit(5);

  // Fetch user's dismissals
  const { data: dismissals } = await supabase
    .from("announcement_dismissals")
    .select("announcement_id")
    .eq("user_id", user.id);

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
        <div className="flex h-screen">
          <ParentSidebar />
          <div className="flex flex-1 flex-col overflow-hidden">
            <ParentMobileHeader />
            {visibleBanner.length > 0 && (
              <AnnouncementBanner announcements={visibleBanner} />
            )}
            <main className="flex-1 overflow-auto basis-0">{children}</main>
          </div>
        </div>
        <OnboardingTour show={!profile?.onboarding_completed} />
      </TooltipProvider>
    </ParentSidebarProvider>
  );
}
