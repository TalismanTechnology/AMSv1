import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { authCookieOptions, isAuthCookieName } from "./cookie-options";
import {
  AUTH_NO_STORE_CACHE_CONTROL,
  copyResponseCookies,
  isTransientAuthError,
} from "./response-cookies";

// Reuse a single admin client across requests (stateless, no session)
const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Public pages that must load for anyone, signed in or not. The legal pages
// are linked from the app stores and sign-in screens, and /support is the App
// Store support URL — none of them may ever bounce to a sign-in screen.
const PUBLIC_PAGES = new Set(["/privacy", "/terms", "/support"]);

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const pathname = request.nextUrl.pathname;

  // ─── Fast path: public routes that never need auth ─────────────────
  if (pathname === "/" || PUBLIC_PAGES.has(pathname)) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: authCookieOptions(),
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          // A new response so the page sees the updated request cookies;
          // keep anything an earlier setAll call already wrote.
          supabaseResponse = copyResponseCookies(
            supabaseResponse,
            NextResponse.next({ request })
          );
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
          supabaseResponse.headers.set("Cache-Control", AUTH_NO_STORE_CACHE_CONTROL);
        },
      },
    }
  );

  // Every response from here on must carry supabaseResponse's cookies:
  // getUser() may have rotated the refresh token (see response-cookies.ts).
  // setAll reassigns supabaseResponse, so it is read at call time.
  const redirectTo = (path: string) =>
    copyResponseCookies(supabaseResponse, redirectResponse(request, path));

  // Self-service registration is gone — parents sign in with Blackbaud. Keep
  // old links and bookmarks working by sending them to the matching login.
  const schoolMatch = pathname.match(/^\/s\/([^/]+)(\/.*)?$/);
  if (pathname === "/register") {
    return redirectTo("/login");
  }
  if (schoolMatch && schoolMatch[2] === "/register") {
    return redirectTo(`/s/${schoolMatch[1]}/login`);
  }

  // School auth pages — only need getUser if user might already be logged in
  const isSchoolAuthRoute = schoolMatch && schoolMatch[2] === "/login";
  const isSchoolPendingRoute =
    schoolMatch && schoolMatch[2] === "/pending";

  // Platform auth pages — skip getUser if no session cookie exists
  const isPlatformAuth = pathname === "/login" || pathname === "/login/staff";
  // Large sessions are split into sb-…-auth-token.0, .1, …; matching only the
  // unchunked name made signed-in users look signed out on the login pages
  // (which is where the native app opens).
  const hasSessionCookie = request.cookies
    .getAll()
    .some((c) => isAuthCookieName(c.name));

  // Skip getUser entirely for auth pages when no session cookie exists
  if ((isPlatformAuth || isSchoolAuthRoute) && !hasSessionCookie) {
    return supabaseResponse;
  }

  // Refresh the session
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  // Supabase Auth unreachable or erroring: the user may still be signed in,
  // and their cookies are untouched (auth-js only clears them on real auth
  // failures). Ask the browser to retry rather than showing a login screen.
  // Access still requires a verified user.
  const authUnavailable = !user && isTransientAuthError(authError);
  const signedOutTo = (path: string) =>
    authUnavailable
      ? copyResponseCookies(supabaseResponse, authUnavailableResponse())
      : redirectTo(path);

  // ─── Platform auth pages (/login, /login/staff) ───────────────────
  if (isPlatformAuth) {
    if (user) {
      const destination = await getDefaultDashboard(supabase, user.id);
      // Don't redirect to "/" — that would loop back to the landing page
      if (destination !== "/") {
        return redirectTo(destination);
      }
    }
    return supabaseResponse;
  }

  // ─── Legacy route redirects ────────────────────────────────────────
  if (pathname.startsWith("/admin") || pathname.startsWith("/parent")) {
    if (!user) return signedOutTo("/login");
    const destination = await getDefaultDashboard(supabase, user.id);
    return redirectTo(destination);
  }

  // ─── Super-admin routes ────────────────────────────────────────────
  if (pathname.startsWith("/super-admin")) {
    if (!user) return signedOutTo("/");
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profile?.role !== "super_admin") return redirectTo("/");
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

    if (!school) return redirectTo("/");

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
          return redirectTo(`/s/${slug}/pending`);
        }

        if (profile?.role === "super_admin" || membership?.role === "admin") {
          return redirectTo(`/s/${slug}/admin`);
        }
        if (membership) {
          return redirectTo(`/s/${slug}/parent`);
        }
      }
      return supabaseResponse;
    }

    // Pending page — redirect away if already approved
    if (isSchoolPendingRoute) {
      if (!user) return signedOutTo(`/s/${slug}/login`);

      const [{ data: profile }, { data: membership }] = await Promise.all([
        supabase.from("profiles").select("role").eq("id", user.id).single(),
        supabase
          .from("school_memberships")
          .select("role, approved")
          .eq("user_id", user.id)
          .eq("school_id", school.id)
          .single(),
      ]);

      if (profile?.role === "super_admin" || (membership && membership.approved)) {
        const dest =
          profile?.role === "super_admin" || membership?.role === "admin"
            ? `/s/${slug}/admin`
            : `/s/${slug}/parent`;
        return redirectTo(dest);
      }

      return supabaseResponse;
    }

    // All other school routes require authentication
    if (!user) return signedOutTo(`/s/${slug}/login`);

    // Fetch profile + membership in parallel (single round-trip)
    const [{ data: profile }, { data: membership }] = await Promise.all([
      supabase
        .from("profiles")
        .select("role, onboarding_completed")
        .eq("id", user.id)
        .single(),
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
      return redirectTo(`/s/${slug}/pending`);
    }

    // /s/{slug}/admin/* — require admin role or super_admin
    if (rest.startsWith("/admin")) {
      if (isSuperAdmin || membership?.role === "admin") {
        return supabaseResponse;
      }
      return redirectTo(`/s/${slug}/parent`);
    }

    // First-run onboarding is required, so it is enforced here rather than in
    // the parent layout alone. A layout redirect fires after the Suspense shell
    // has already streamed, which degrades to a one-second meta refresh — the
    // parent sees the dashboard flash before being bounced. Returning 307 here
    // means the dashboard is never sent at all.
    const needsOnboarding =
      !isSuperAdmin &&
      membership?.role === "parent" &&
      membership.approved &&
      !profile?.onboarding_completed;

    if (needsOnboarding && !rest.startsWith("/welcome")) {
      return redirectTo(`/s/${slug}/welcome`);
    }

    // Already onboarded — don't let them back onto the first-run form.
    if (!needsOnboarding && rest.startsWith("/welcome")) {
      return redirectTo(
        isSuperAdmin || membership?.role === "admin"
          ? `/s/${slug}/admin`
          : `/s/${slug}/parent`
      );
    }

    // /s/{slug}/parent/* or any other school route — require membership
    if (isSuperAdmin || (membership && membership.approved)) {
      return supabaseResponse;
    }

    return redirectTo("/");
  }

  // ─── Fallback ──────────────────────────────────────────────────────
  return supabaseResponse;
}

// ─── Helpers ───────────────────────────────────────────────────────────

// Once the Supabase client exists, use updateSession's redirectTo instead,
// which carries the auth cookies.
function redirectResponse(request: NextRequest, path: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = path;
  return NextResponse.redirect(url);
}

function authUnavailableResponse(): NextResponse {
  return new NextResponse(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="5"><title>AskMySchool</title><p style="font-family:system-ui,sans-serif;text-align:center;margin-top:30vh">Having trouble reaching the server. Retrying…</p>',
    {
      status: 503,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Retry-After": "5",
        "Cache-Control": "no-store",
      },
    }
  );
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
