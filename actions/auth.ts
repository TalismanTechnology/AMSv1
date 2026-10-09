"use server";

import { createClient } from "@/lib/supabase/server";
import { getStaffRole } from "@/lib/auth/parent-session";
import { forgetThisDevice } from "@/lib/push/device-cookie";
import { redirect } from "next/navigation";

const PARENT_PASSWORD_ERROR =
  "Parents sign in with their school account. Choose your school and use “Sign in with Blackbaud” or “Sign in with Veracross”.";

// Email/password sign-in is for school staff and super admins only. Parents
// come in through Blackbaud or Veracross (app/auth/blackbaud,
// app/auth/veracross), which check the school's parent records — a password
// would let them skip that check.
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
    await supabase.auth.signOut({ scope: "local" });
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
      await supabase.auth.signOut({ scope: "local" });
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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) await forgetThisDevice(user.id);
  // Only this device: signing out on a shared school computer shouldn't sign
  // the same person out of their phone.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/");
}
