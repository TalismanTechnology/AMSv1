import { logout } from "@/actions/auth";
import { SubmitButton } from "@/components/ui/submit-button";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "super_admin") redirect("/");

  return (
    <div className="relative z-10 min-h-screen bg-background">
      {/* Padded by the safe-area insets (viewport-fit=cover) so the header
          clears the notch/status bar in the native app, matching the
          admin/parent mobile headers. */}
      <header className="border-b border-border pt-[calc(1rem_+_env(safe-area-inset-top))] pb-4 pl-[calc(1rem_+_env(safe-area-inset-left))] pr-[calc(1rem_+_env(safe-area-inset-right))] sm:pl-[calc(1.5rem_+_env(safe-area-inset-left))] sm:pr-[calc(1.5rem_+_env(safe-area-inset-right))]">
        <div className="flex items-center justify-between gap-4">
          <h1 className="min-w-0 truncate text-sm font-semibold text-ink tracking-[-0.01em]">Super Admin</h1>
          <form action={logout} className="shrink-0">
            <SubmitButton
              variant="link"
              size="sm"
              className="h-auto p-0 text-sm font-normal text-muted-foreground hover:text-foreground hover:no-underline has-[>svg]:px-0"
              pendingText="Signing out…"
            >
              Sign out
            </SubmitButton>
          </form>
        </div>
      </header>
      <main className="pt-8 pb-[calc(2.5rem_+_env(safe-area-inset-bottom))] pl-[calc(1rem_+_env(safe-area-inset-left))] pr-[calc(1rem_+_env(safe-area-inset-right))] sm:pt-10 sm:pl-[calc(1.5rem_+_env(safe-area-inset-left))] sm:pr-[calc(1.5rem_+_env(safe-area-inset-right))]">
        {children}
      </main>
    </div>
  );
}
