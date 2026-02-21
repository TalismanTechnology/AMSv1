import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

// Reuse a single admin client across requests (stateless, no session)
const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const pathname = request.nextUrl.pathname;

  // ─── Fast path: public routes that never need auth ─────────────────
  if (pathname === "/") {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // School auth pages — only need getUser if user might already be logged in
  const schoolMatch = pathname.match(/^\/s\/([^/]+)(\/.*)?$/);
  const isSchoolAuthRoute =
    schoolMatch &&
    (schoolMatch[2] === "/login" || schoolMatch[2] === "/register");
  const isSchoolPendingRoute =
    schoolMatch && schoolMatch[2] === "/pending";

  // Platform auth pages — skip getUser if no session cookie exists
  const isPlatformAuth = pathname === "/login" || pathname === "/register";
  const hasSessionCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token"));

  // Skip getUser entirely for auth pages when no session cookie exists
  if ((isPlatformAuth || isSchoolAuthRoute) && !hasSessionCookie) {
    return supabaseResponse;
  }

  // Refresh the session
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ─── Platform auth pages (/login, /register) ──────────────────────
  if (isPlatformAuth) {
    if (user) {
      const destination = await getDefaultDashboard(supabase, user.id);
      // Don't redirect to "/" — that would loop back to the landing page
      if (destination !== "/") {
        return redirectTo(request, destination);
      }
    }
    return supabaseResponse;
  }

  // ─── Legacy route redirects ────────────────────────────────────────
  if (pathname.startsWith("/admin") || pathname.startsWith("/parent")) {
    if (!user) return redirectTo(request, "/login");
    const destination = await getDefaultDashboard(supabase, user.id);
    return redirectTo(request, destination);
  }

  // ─── Super-admin routes ────────────────────────────────────────────
  if (pathname.startsWith("/super-admin")) {
    if (!user) return redirectTo(request, "/");
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profile?.role !== "super_admin") return redirectTo(request, "/");
    return supabaseResponse;
  }

  // ─── School-scoped routes: /s/{slug}/* ─────────────────────────────
  if (schoolMatch) {
    const slug = schoolMatch[1];
    const rest = schoolMatch[2] || "";

    // Resolve school from slug (uses module-level admin client)
    const { data: school } = await adminClient
      .from("schools")
      .select("id, slug")
      .eq("slug", slug)
      .single();

    if (!school) return redirectTo(request, "/");

    // School auth pages
    if (isSchoolAuthRoute) {
      if (user) {
        // Fetch profile + membership in parallel
        const [{ data: profile }, { data: membership }] = await Promise.all([
          supabase.from("profiles").select("role").eq("id", user.id).single(),
          supabase
            .from("school_memberships")
            .select("role, approved")
            .eq("user_id", user.id)
            .eq("school_id", school.id)
            .single(),
        ]);

        // If membership exists but not approved, redirect to pending
        if (membership && !membership.approved) {
          return redirectTo(request, `/s/${slug}/pending`);
        }

        if (profile?.role === "super_admin" || membership?.role === "admin") {
          return redirectTo(request, `/s/${slug}/admin`);
        }
        if (membership) {
          return redirectTo(request, `/s/${slug}/parent`);
        }
      }
      return supabaseResponse;
    }

    // Pending page — allow if user has an unapproved membership
    if (isSchoolPendingRoute) {
      if (!user) return redirectTo(request, `/s/${slug}/login`);
      return supabaseResponse;
    }

    // All other school routes require authentication
    if (!user) return redirectTo(request, `/s/${slug}/login`);

    // Fetch profile + membership in parallel (single round-trip)
    const [{ data: profile }, { data: membership }] = await Promise.all([
      supabase.from("profiles").select("role").eq("id", user.id).single(),
      supabase
        .from("school_memberships")
        .select("role, approved")
        .eq("user_id", user.id)
        .eq("school_id", school.id)
        .single(),
    ]);

    const isSuperAdmin = profile?.role === "super_admin";

    // If membership exists but not approved, redirect to pending
    if (membership && !membership.approved && !isSuperAdmin) {
      return redirectTo(request, `/s/${slug}/pending`);
    }

    // /s/{slug}/admin/* — require admin role or super_admin
    if (rest.startsWith("/admin")) {
      if (isSuperAdmin || membership?.role === "admin") {
        return supabaseResponse;
      }
      return redirectTo(request, `/s/${slug}/parent`);
    }

    // /s/{slug}/parent/* or any other school route — require membership
    if (isSuperAdmin || (membership && membership.approved)) {
      return supabaseResponse;
    }

    return redirectTo(request, "/");
  }

  // ─── Fallback ──────────────────────────────────────────────────────
  return supabaseResponse;
}

// ─── Helpers ───────────────────────────────────────────────────────────

function redirectTo(request: NextRequest, path: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = path;
  return NextResponse.redirect(url);
}

async function getDefaultDashboard(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  userId: string
): Promise<string> {
  // Fetch profile + first membership in parallel
  const [{ data: profile }, { data: membership }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", userId).single(),
    supabase
      .from("school_memberships")
      .select("role, approved, school_id, schools(slug)")
      .eq("user_id", userId)
      .limit(1)
      .single(),
  ]);

  if (profile?.role === "super_admin") return "/super-admin";

  if (
    membership?.schools &&
    typeof membership.schools === "object" &&
    "slug" in membership.schools
  ) {
    const slug = (membership.schools as { slug: string }).slug;
    if (!membership.approved) {
      return `/s/${slug}/pending`;
    }
    return membership.role === "admin"
      ? `/s/${slug}/admin`
      : `/s/${slug}/parent`;
  }

  return "/";
}
