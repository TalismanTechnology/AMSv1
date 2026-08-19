import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncRoster } from "@/lib/blackbaud/roster";

export const maxDuration = 300;

function isAuthorized(request: Request, secret: string): boolean {
  // Prefer the header: query strings land in access logs and proxy logs.
  const header = request.headers.get("authorization");
  const presented = header?.startsWith("Bearer ")
    ? header.slice(7)
    : new URL(request.url).searchParams.get("key");

  if (!presented || presented.length !== secret.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(presented),
    Buffer.from(secret)
  );
}

// Refresh every connected school's parent roster.
//   GET /api/cron/sync-blackbaud-roster
//   Authorization: Bearer <CRON_SECRET>   (or ?key=<CRON_SECRET>)
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  if (!isAuthorized(request, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: connections, error } = await supabase
    .from("blackbaud_connections")
    .select("school_id")
    .in("status", ["connected", "error"]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: Array<Record<string, unknown>> = [];

  // Sequential on purpose: parallel syncs would multiply our SKY API request
  // rate across schools and trip the shared subscription-level throttle.
  for (const connection of connections ?? []) {
    try {
      results.push({ ...(await syncRoster(connection.school_id)), ok: true });
    } catch (caught: unknown) {
      const message =
        caught instanceof Error ? caught.message : "Unknown sync failure";

      // One school's failure must not abort the rest. Record it and continue;
      // the existing roster stays in place so logins keep working.
      await supabase
        .from("blackbaud_connections")
        .update({
          status: "error",
          last_error: message,
          updated_at: new Date().toISOString(),
        })
        .eq("school_id", connection.school_id);

      results.push({ schoolId: connection.school_id, ok: false, error: message });
    }
  }

  return NextResponse.json({
    schools: results.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}
