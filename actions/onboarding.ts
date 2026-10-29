"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { GRADE_VALUES } from "@/lib/grades";
import { CHILDREN_PROMPT_SKIP_COOKIE } from "@/lib/onboarding/children-prompt";

// First-run step for a parent who arrived via their school's SSO. Registration
// used to collect children; SSO bypasses registration, so this fills that gap.

const childSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  grade: z.string().refine((value) => GRADE_VALUES.includes(value), "Invalid grade"),
});

const onboardingSchema = z.object({
  schoolId: z.string().uuid(),
  // At least one child is required — onboarding is a gate, not a suggestion.
  children: z.array(childSchema).min(1).max(12),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;

export async function completeOnboarding(
  input: OnboardingInput
): Promise<{ error?: string; success?: boolean }> {
  const parsed = onboardingSchema.safeParse(input);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid details" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not signed in" };
  }

  // Never trust the school id from the client — confirm this user actually
  // belongs to it before writing children scoped to that school.
  const { data: membership } = await supabase
    .from("school_memberships")
    .select("id, approved")
    .eq("user_id", user.id)
    .eq("school_id", parsed.data.schoolId)
    .maybeSingle();

  if (!membership?.approved) {
    return { error: "You don't have access to this school" };
  }

  const { error: childrenError } = await supabase.from("children").insert(
    parsed.data.children.map((child) => ({
      parent_id: user.id,
      name: child.name.trim(),
      grade: child.grade,
      school_id: parsed.data.schoolId,
    }))
  );

  if (childrenError) {
    return { error: "Could not save your children. Please try again." };
  }

  // Only flip the flag after the children land, so a failed write leaves the
  // parent on the form rather than past a gate with nothing recorded.
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ onboarding_completed: true })
    .eq("id", user.id);

  if (profileError) {
    return { error: "Could not finish setting up your account." };
  }

  return { success: true };
}

/**
 * Marks onboarding done without collecting anything. Used for parents who
 * already have children on file — they registered before SSO existed and
 * should not be sent through a form for data we already hold.
 */
export async function markOnboardingComplete(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  await supabase
    .from("profiles")
    .update({ onboarding_completed: true })
    .eq("id", user.id);
}

/**
 * "Skip for now" on the add-your-children step. Onboarding counts as done so
 * the first-run gate lets them in, and a session cookie keeps the reminder
 * away until their next session — it returns while they still have no
 * children on file.
 */
export async function skipChildrenPrompt(): Promise<void> {
  await markOnboardingComplete();

  const cookieStore = await cookies();
  cookieStore.set(CHILDREN_PROMPT_SKIP_COOKIE, "1", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}
