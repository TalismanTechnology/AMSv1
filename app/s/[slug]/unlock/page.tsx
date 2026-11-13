import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSchoolBySlug, getUserSchoolMembership } from "@/lib/school-context";
import { superAdminLockedOut } from "@/lib/school-lock/access";
import { hasGenuineAccess } from "@/lib/school-lock/core";
import { UnlockForm } from "./unlock-form";

// Shown instead of a school's dashboard to a super-admin the school's owner
// lock keeps out (requireSchoolContext sends them here). Everyone else, and a
// super-admin who isn't locked out, goes on to the school.
export default async function UnlockSchoolPage({
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
  if (!user) redirect(`/s/${slug}/login`);

  const [{ data: profile }, membership] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).single(),
    getUserSchoolMembership(user.id, school.id),
  ]);
  if (
    profile?.role !== "super_admin" ||
    hasGenuineAccess(membership, "admin") ||
    !(await superAdminLockedOut(user.id, school.id))
  ) {
    redirect(`/s/${slug}`);
  }

  return (
    <div className="relative z-10 flex min-h-screen flex-col items-center justify-center overflow-hidden px-6">
      <div className="relative z-10 w-full max-w-md">
        <div className="metallic-card rounded-3xl px-8 py-11 sm:px-10">
          <span className="mx-auto mb-7 flex size-16 items-center justify-center rounded-2xl bg-muted text-ink elev-1">
            <LockKeyhole className="h-8 w-8" />
          </span>

          <div className="text-center">
            <p className="eyebrow">Owner lock</p>
            <h1 className="mt-3 font-serif-display text-3xl font-medium tracking-[-0.02em] text-ink">
              {school.name} is locked
            </h1>
            <p className="mt-3 text-sm text-ink-soft">
              This school&apos;s admins have locked it to platform staff. Enter
              the password they gave you to open it for 4 hours.
            </p>
          </div>

          <div className="mt-8">
            <UnlockForm slug={slug} />
          </div>

          <div className="mt-6 text-center">
            <Link
              href="/super-admin"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-ink"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              All schools
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
