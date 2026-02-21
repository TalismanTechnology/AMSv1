import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Publish scheduled announcements whose publish_at has passed.
// Trigger via Vercel Cron or an external scheduler:
//   GET /api/cron/publish-announcements?key=<CRON_SECRET>
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");

  // Simple shared-secret auth (set CRON_SECRET in env)
  if (process.env.CRON_SECRET && key !== process.env.CRON_SECRET) {
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
