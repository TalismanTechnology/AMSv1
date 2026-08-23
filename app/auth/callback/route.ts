import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findRosterMatch } from "@/lib/blackbaud/roster";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const schoolSlug = searchParams.get("school_slug");
  const errorParam = searchParams.get("error_description") || searchParams.get("error");

  // Helper: build a redirect that keeps OAuth errors visible on the login page
  const loginUrl = (msg?: string) => {
    const base = schoolSlug ? `${origin}/s/${schoolSlug}/login` : `${origin}/login`;
    return msg ? `${base}?error=${encodeURIComponent(msg)}` : base;
  };

  if (errorParam) {
    return NextResponse.redirect(loginUrl(errorParam));
  }

  if (!code) {
    return NextResponse.redirect(loginUrl("Missing OAuth code"));
  }

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    return NextResponse.redirect(loginUrl(exchangeError.message));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(loginUrl("Could not load user after sign-in"));
  }

  const admin = createAdminClient();

  // ─── School-scoped flow: create membership if missing ──────────────
  if (schoolSlug) {
    const { data: school } = await admin
      .from("schools")
      .select("id, slug, blackbaud_verification_enabled")
      .eq("slug", schoolSlug)
      .single();

    if (!school) {
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/?error=${encodeURIComponent("School not found")}`);
    }

    const { data: existing } = await admin
      .from("school_memberships")
      .select("role, approved")
      .eq("user_id", user.id)
      .eq("school_id", school.id)
      .maybeSingle();

    if (!existing) {
      // First sign-in for this person at this school. When the school gates on
      // Blackbaud, their guardian roster decides who gets in — not self-service
      // registration and not an admin approval queue.
      if (school.blackbaud_verification_enabled) {
        const rosterMatch = user.email
          ? await findRosterMatch(school.id, user.email)
          : null;

        if (!rosterMatch) {
          // Authenticated with the school's own IdP but not a guardian on the
          // roster — staff, students, alumni, or a parent the school hasn't
          // synced yet. Sign out so they aren't left in a half-authenticated
          // state with no membership.
          await supabase.auth.signOut();
          return NextResponse.redirect(
            loginUrl(
              "Your account isn't listed as a parent or guardian in your school's records. Please contact your school office."
            )
          );
        }

        const { error: insertError } = await admin
          .from("school_memberships")
          .insert({
            user_id: user.id,
            school_id: school.id,
            role: "parent",
            // The roster match IS the approval — no pending queue.
            approved: true,
          });

        if (insertError) {
          await supabase.auth.signOut();
          return NextResponse.redirect(loginUrl(insertError.message));
        }

        return NextResponse.redirect(`${origin}/s/${school.slug}/parent`);
      }

      const { data: settings } = await admin
        .from("settings")
        .select("require_approval")
        .eq("school_id", school.id)
        .single();

      const requiresApproval = settings?.require_approval ?? true;

      const { error: insertError } = await admin.from("school_memberships").insert({
        user_id: user.id,
        school_id: school.id,
        role: "parent",
        approved: !requiresApproval,
      });

      if (insertError) {
        await supabase.auth.signOut();
        return NextResponse.redirect(loginUrl(insertError.message));
      }

      return NextResponse.redirect(
        requiresApproval
          ? `${origin}/s/${school.slug}/pending`
          : `${origin}/s/${school.slug}/parent`
      );
    }

    if (!existing.approved) {
      return NextResponse.redirect(`${origin}/s/${school.slug}/pending`);
    }
    return NextResponse.redirect(
      `${origin}/s/${school.slug}/${existing.role === "admin" ? "admin" : "parent"}`
    );
  }

  // ─── Platform-wide flow: sign-in only, no membership creation ──────
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role === "super_admin") {
    return NextResponse.redirect(`${origin}/super-admin`);
  }

  const { data: membership } = await admin
    .from("school_memberships")
    .select("role, approved, schools(slug)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  const schoolsRel = membership?.schools as { slug: string } | null | undefined;
  if (schoolsRel && typeof schoolsRel === "object" && "slug" in schoolsRel) {
    const slug = schoolsRel.slug;
    if (!membership!.approved) {
      return NextResponse.redirect(`${origin}/s/${slug}/pending`);
    }
    return NextResponse.redirect(
      `${origin}/s/${slug}/${membership!.role === "admin" ? "admin" : "parent"}`
    );
  }

  // No membership — this identity isn't linked to a school. Sign out and
  // point them at their school's login page.
  await supabase.auth.signOut();
  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent("No school account found for this email. Use your school's login page to sign in or register.")}`
  );
}
