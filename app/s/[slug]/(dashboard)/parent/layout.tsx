import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSchoolContext } from "@/lib/school-context";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ParentSidebarProvider } from "@/components/parent/sidebar-context";
import { ParentSidebar } from "@/components/parent/parent-sidebar";
import { ParentMobileHeader } from "@/components/parent/mobile-header";
import { ChatHistoryBridgeProvider } from "@/components/parent/chat-history-bridge";
import { NativePush } from "@/components/native/native-push";

export default async function ParentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { user, role } = await requireSchoolContext(slug);

  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, onboarding_completed")
    .eq("id", user.id)
    .single();

  // Onboarding is required, so it is enforced here rather than by a link the
  // parent could route around. Admins viewing the parent surface are exempt —
  // they have no children to record.
  if (role === "parent" && !profile?.onboarding_completed) {
    redirect(`/s/${slug}/welcome`);
  }

  return (
    <ParentSidebarProvider
      userName={profile?.full_name || user.email || ""}
    >
      <TooltipProvider>
        <ChatHistoryBridgeProvider>
          <div className="flex h-dvh">
            <ParentSidebar />
            <div className="flex flex-1 flex-col overflow-hidden">
              <ParentMobileHeader />
              <main className="dashboard-cards flex-1 overflow-auto basis-0">{children}</main>
            </div>
          </div>
        </ChatHistoryBridgeProvider>
        <NativePush />
      </TooltipProvider>
    </ParentSidebarProvider>
  );
}
