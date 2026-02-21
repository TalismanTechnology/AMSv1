"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";

export async function login(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const schoolSlug = formData.get("school_slug") as string;
  const schoolId = formData.get("school_id") as string;

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Login failed" };

  // If school context is provided, look up membership role
  if (schoolSlug && schoolId) {
    const { data: membership } = await supabase
      .from("school_memberships")
      .select("role, approved")
      .eq("user_id", user.id)
      .eq("school_id", schoolId)
      .single();

    if (!membership) {
      // User has auth credentials but no membership for this school
      await supabase.auth.signOut();
      return { error: "You don't have an account with this school. Please register first." };
    }

    if (!membership.approved) {
      redirect(`/s/${schoolSlug}/pending`);
    }

    if (membership.role === "admin") {
      redirect(`/s/${schoolSlug}/admin`);
    } else {
      redirect(`/s/${schoolSlug}/parent`);
    }
  }

  // No school context — find user's first school membership
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role === "super_admin") {
    redirect("/super-admin");
  }

  const { data: membership } = await supabase
    .from("school_memberships")
    .select("role, approved, school_id, schools(slug)")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (membership?.schools && typeof membership.schools === "object" && "slug" in membership.schools) {
    const slug = (membership.schools as { slug: string }).slug;
    if (!membership.approved) {
      redirect(`/s/${slug}/pending`);
    }
    if (membership.role === "admin") {
      redirect(`/s/${slug}/admin`);
    } else {
      redirect(`/s/${slug}/parent`);
    }
  }

  // No memberships — back to landing
  redirect("/");
}

export async function register(formData: FormData) {
  const supabase = await createClient();
  const admin = createAdminClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const fullName = formData.get("full_name") as string;
  const role = formData.get("role") as string;
  const childGrade = formData.get("child_grade") as string;
  const childName = formData.get("child_name") as string;
  const joinCode = (formData.get("join_code") as string)?.trim().toUpperCase();
  let schoolSlug = formData.get("school_slug") as string;
  let schoolId = formData.get("school_id") as string;

  if (role !== "parent" && role !== "admin") {
    return { error: "Invalid role selected" };
  }

  // If join code provided, look up the school
  if (joinCode) {
    const { data: school } = await admin
      .from("schools")
      .select("id, slug")
      .eq("join_code", joinCode)
      .single();

    if (!school) {
      return { error: "Invalid school code" };
    }

    schoolId = school.id;
    schoolSlug = school.slug;
  }

  if (!schoolId) {
    return { error: "Please select a school or enter a school code" };
  }

  // Check if school requires join code
  const { data: settings } = await admin
    .from("settings")
    .select("require_join_code, require_approval")
    .eq("school_id", schoolId)
    .single();

  if (settings?.require_join_code && !joinCode) {
    return { error: "This school requires a join code to register" };
  }

  // Validate join code matches if school requires it
  if (settings?.require_join_code && joinCode) {
    const { data: school } = await admin
      .from("schools")
      .select("join_code")
      .eq("id", schoolId)
      .single();

    if (school?.join_code !== joinCode) {
      return { error: "Invalid school code" };
    }
  }

  const requiresApproval = role === "parent" && (settings?.require_approval ?? true);

  const { data: signUpData, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        role,
        ...(role === "parent" && childGrade ? { child_grade: childGrade } : {}),
        ...(role === "parent" && childName ? { child_name: childName } : {}),
      },
    },
  });

  if (error) {
    return { error: error.message };
  }

  const newUserId = signUpData.user?.id;

  // Create school membership
  if (newUserId && schoolId) {
    await admin.from("school_memberships").insert({
      user_id: newUserId,
      school_id: schoolId,
      role,
      approved: !requiresApproval,
    });

    // If parent with child info, create children record
    if (role === "parent" && childName && newUserId) {
      await admin.from("children").insert({
        parent_id: newUserId,
        name: childName,
        grade: childGrade || null,
        school_id: schoolId,
      });
    }
  }

  if (schoolSlug) {
    if (requiresApproval) {
      redirect(`/s/${schoolSlug}/pending`);
    }
    if (role === "admin") {
      redirect(`/s/${schoolSlug}/admin`);
    } else {
      redirect(`/s/${schoolSlug}/parent`);
    }
  }

  // No school context — redirect to landing
  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
