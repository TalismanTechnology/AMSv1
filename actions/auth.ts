"use server";

import { createClient } from "@/lib/supabase/server";
import { getStaffRole } from "@/lib/auth/parent-session";
import { redirect } from "next/navigation";

const PARENT_PASSWORD_ERROR =
  "Parents sign in with Blackbaud. Choose your school and use “Sign in with Blackbaud”.";

// Email/password sign-in is for school staff and super admins only. Parents
// come in through Blackbaud (app/auth/blackbaud), which checks the school's
// parent roster — a password would let them skip that check.
export async function login(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const schoolSlug = formData.get("school_slug") as string;
  const schoolId = formData.get("school_id") as string;

  const {
    data: { user },
    error,
  } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  // signInWithPassword already returns the verified user; no second round trip.
  if (!user) return { error: "Login failed" };

  const staffRole = await getStaffRole(user.id);

  if (!staffRole) {
    await supabase.auth.signOut();
    return { error: PARENT_PASSWORD_ERROR };
  }

  if (staffRole === "super_admin") {
    redirect(schoolSlug ? `/s/${schoolSlug}/admin` : "/super-admin");
  }

  // School staff: go to the admin side of the school they signed in from, or
  // of the first school they administer.
  if (schoolSlug && schoolId) {
    const { data: membership } = await supabase
      .from("school_memberships")
      .select("role")
      .eq("user_id", user.id)
      .eq("school_id", schoolId)
      .maybeSingle();

    if (membership?.role !== "admin") {
      await supabase.auth.signOut();
      return { error: "You're not a staff member at this school." };
    }

    redirect(`/s/${schoolSlug}/admin`);
  }

  const { data: membership } = await supabase
    .from("school_memberships")
    .select("schools(slug)")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();

  const slug = (membership?.schools as { slug: string } | null | undefined)?.slug;
  redirect(slug ? `/s/${slug}/admin` : "/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
