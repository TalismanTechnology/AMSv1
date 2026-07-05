import { notFound } from "next/navigation";
import Link from "next/link";
import { getSchoolBySlug, getUserSchools } from "@/lib/school-context";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Clock, ArrowLeft } from "lucide-react";
import { logout } from "@/actions/auth";
import { PendingPoller } from "./pending-poller";

export default async function PendingApprovalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Get user's other approved schools so they can navigate back
  let otherSchools: { slug: string; name: string; role: string }[] = [];
  if (user) {
    const memberships = await getUserSchools(user.id);
    otherSchools = memberships
      .filter((m) => m.school_id !== school.id && m.approved && m.school)
      .map((m) => ({
        slug: m.school!.slug,
        name: m.school!.name,
        role: m.role,
      }));
  }

  return (
    <div className="relative z-10 flex min-h-screen flex-col items-center justify-center overflow-hidden px-6">
      <div
        aria-hidden
        className="depth-glow left-1/2 top-1/4 h-96 w-96 -translate-x-1/2"
        style={{ background: "oklch(0.72 0.15 70 / 14%)" }}
      />
      <div className="relative z-10 w-full max-w-md">
        <div className="metallic-card rounded-3xl px-8 py-11 text-center sm:px-10">
          <span className="mx-auto mb-7 flex size-16 items-center justify-center rounded-2xl bg-warning/15 text-warning elev-1">
            <Clock className="h-8 w-8" />
          </span>

          <p className="eyebrow">Almost there</p>
          <h1 className="mt-3 font-serif-display text-3xl font-medium tracking-[-0.02em] text-ink">
            Pending approval
          </h1>
          <p className="mt-3 text-ink-soft">
            Your request to join <strong className="text-ink">{school.name}</strong> is
            pending review. A school administrator will approve your access.
          </p>

          <div className="mt-6">
            <PendingPoller slug={slug} />
          </div>

        <div className="mt-6 flex flex-col items-center gap-3">
          {otherSchools.length > 0 && (
            <div className="space-y-2 w-full">
              <p className="text-sm text-muted-foreground">Your other schools:</p>
              {otherSchools.map((s) => (
                <Button key={s.slug} asChild variant="outline" className="w-full">
                  <Link href={`/s/${s.slug}/${s.role === "admin" ? "admin" : "parent"}`}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    {s.name}
                  </Link>
                </Button>
              ))}
            </div>
          )}

          <form action={logout} className="w-full">
            <Button type="submit" variant="ghost" className="w-full text-muted-foreground">
              Sign out
            </Button>
          </form>
        </div>
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Powered by AskMySchool
        </p>
      </div>
    </div>
  );
}
