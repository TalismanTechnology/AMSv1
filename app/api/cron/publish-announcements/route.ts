import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCronAuthorized } from "@/lib/blackbaud/cron-auth";

// Publish scheduled announcements whose publish_at has passed.
//   GET /api/cron/publish-announcements
//   Authorization: Bearer <CRON_SECRET>   (or ?key=<CRON_SECRET>)
//
// Vercel Cron presents the secret as a Bearer header, so this route has to
// accept the same two forms as the Blackbaud sync routes.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  if (!isCronAuthorized(request, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Publish scheduled announcements
  const { data, error } = await supabase
    .from("announcements")
    .update({ status: "published" })
    .eq("status", "scheduled")
    .lte("publish_at", new Date().toISOString())
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Delete expired announcements (past their expires_at date)
  const { data: deleted, error: deleteError } = await supabase
    .from("announcements")
    .delete()
    .not("expires_at", "is", null)
    .lte("expires_at", new Date().toISOString())
    .select("id");

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({
    published: data?.length ?? 0,
    published_ids: data?.map((a) => a.id) ?? [],
    deleted: deleted?.length ?? 0,
    deleted_ids: deleted?.map((a) => a.id) ?? [],
  });
}
