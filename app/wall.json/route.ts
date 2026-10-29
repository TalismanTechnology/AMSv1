import { createAdminClient } from "@/lib/supabase/admin";
import { isValidWallToken } from "@/lib/wall/token";
import { loadWallStats } from "@/lib/wall/stats";

// Token-gated aggregate numbers for home-screen widgets (e.g. Scriptable):
// /wall.json?token=…  Same aggregates as /wall — counts only, no personal data.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

export async function GET(request: Request) {
  if (!isValidWallToken(new URL(request.url).searchParams.get("token"))) {
    return new Response("Not found", { status: 404, headers: NO_STORE });
  }
  const stats = await loadWallStats(createAdminClient());
  return Response.json(stats, { headers: NO_STORE });
}
