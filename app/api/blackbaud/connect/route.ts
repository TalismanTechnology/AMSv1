import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSchoolBySlug } from "@/lib/school-context";
import { buildAuthorizeUrl } from "@/lib/blackbaud/oauth";
import {
  createOAuthState,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_MAX_AGE_SECONDS,
} from "@/lib/blackbaud/state";

// Starts the per-school Blackbaud authorization. A school admin hits this and
// gets redirected to Blackbaud's consent screen.
//
//   GET /api/blackbaud/connect?school=<slug>
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("school");

  if (!slug) {
    return NextResponse.json({ error: "Missing school" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const school = await getSchoolBySlug(slug);

  if (!school) {
    return NextResponse.json({ error: "School not found" }, { status: 404 });
  }

  // Authorize against this specific school — being an admin somewhere else must
  // not let you bind a Blackbaud connection here.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "super_admin") {
    const { data: membership } = await supabase
      .from("school_memberships")
      .select("role")
      .eq("user_id", user.id)
      .eq("school_id", school.id)
      .single();

    if (membership?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const state = createOAuthState(school.id, school.slug);
  const response = NextResponse.redirect(buildAuthorizeUrl(state));

  // Binds the callback to this browser. Lax (not Strict) because the callback
  // arrives as a top-level navigation from Blackbaud's domain, which Strict
  // would drop — taking the cookie with it and breaking every connect.
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/blackbaud",
    maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
  });

  return response;
}
