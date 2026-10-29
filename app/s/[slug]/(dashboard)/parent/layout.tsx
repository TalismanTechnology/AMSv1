import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSchoolContext } from "@/lib/school-context";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ParentSidebarProvider } from "@/components/parent/sidebar-context";
import { ParentSidebar } from "@/components/parent/parent-sidebar";
import { ParentMobileHeader } from "@/components/parent/mobile-header";
import { ChatHistoryBridgeProvider } from "@/components/parent/chat-history-bridge";
import { NativePush } from "@/components/native/native-push";
import { AddChildrenPrompt } from "@/components/parent/add-children-prompt";
import {
  CHILDREN_PROMPT_SKIP_COOKIE,
  shouldPromptForChildren,
} from "@/lib/onboarding/children-prompt";

export default async function ParentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { user, school, role, isSuperAdmin } = await requireSchoolContext(slug);

  const supabase = await createClient();

  const [{ data: profile }, { count: childCount }, cookieStore] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, onboarding_completed")
      .eq("id", user.id)
      .single(),
    role === "parent"
      ? supabase
          .from("children")
          .select("id", { count: "exact", head: true })
          .eq("parent_id", user.id)
          .eq("school_id", school.id)
      : Promise.resolve({ count: null }),
    cookies(),
  ]);

  // Onboarding is required, so it is enforced here rather than by a link the
  // parent could route around. Admins viewing the parent surface are exempt —
  // they have no children to record.
  if (role === "parent" && !profile?.onboarding_completed) {
    redirect(`/s/${slug}/welcome`);
  }

  // Onboarded but still no children (e.g. skipped, or signed in with a
  // different email than the one their children are under): ask again, once
  // per session, without blocking the page. A failed count (null) never prompts.
  const promptForChildren =
    childCount !== null &&
    shouldPromptForChildren({
      role,
      isSuperAdmin,
      childCount,
      skippedThisSession: cookieStore.has(CHILDREN_PROMPT_SKIP_COOKIE),
    });

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
        {promptForChildren && <AddChildrenPrompt slug={slug} />}
      </TooltipProvider>
    </ParentSidebarProvider>
  );
}
