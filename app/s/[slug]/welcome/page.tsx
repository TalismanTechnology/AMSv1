import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSchoolContext } from "@/lib/school-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { markOnboardingComplete } from "@/actions/onboarding";
import { WelcomeForm } from "./welcome-form";

interface WelcomePageProps {
  params: Promise<{ slug: string }>;
}

export default async function WelcomePage({ params }: WelcomePageProps) {
  const { slug } = await params;
  const { user, school, role } = await requireSchoolContext(slug);

  // Admins never see this — they have no children to record here.
  if (role === "admin") {
    redirect(`/s/${slug}/admin`);
  }

  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, onboarding_completed")
    .eq("id", user.id)
    .single();

  if (profile?.onboarding_completed) {
    redirect(`/s/${slug}/parent`);
  }

  // Parents who registered before SSO existed already have children on file.
  // Flip the flag and let them through rather than asking again.
  const { count: childCount } = await supabase
    .from("children")
    .select("id", { count: "exact", head: true })
    .eq("parent_id", user.id)
    .eq("school_id", school.id);

  if ((childCount ?? 0) > 0) {
    await markOnboardingComplete();
    redirect(`/s/${slug}/parent`);
  }

  // The name the school has on file. Shown so the parent can see which record
  // they were matched to — a wrong match surfaces here rather than silently.
  // Admin client because blackbaud_roster is service-role only by design.
  let rosterName: string | null = null;

  if (school.blackbaud_verification_enabled && user.email) {
    const admin = createAdminClient();
    const { data: rosterRow } = await admin
      .from("blackbaud_roster")
      .select("first_name, last_name")
      .eq("school_id", school.id)
      .eq("email", user.email.trim().toLowerCase())
      .eq("is_active", true)
      .maybeSingle();

    if (rosterRow) {
      const name = [rosterRow.first_name, rosterRow.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();
      rosterName = name || null;
    }
  }

  return (
    <WelcomeForm
      schoolId={school.id}
      schoolSlug={school.slug}
      schoolName={school.name}
      rosterName={rosterName}
      fallbackName={profile?.full_name ?? null}
    />
  );
}
