import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/blackbaud/cron-auth";
import { runWebsiteSyncBatch, startDueWebsiteSyncs } from "./sync";

// Each call works for at most ~240s so it ends well inside the routes'
// maxDuration (300s); the crawl queue is persisted, so the next call picks up
// where this one stopped.
const TIME_BUDGET_MS = 240_000;

/**
 * Shared handler for the website-sync cron routes. `startDue` begins a new
 * run for every enabled source not started in ~20h; either way, running
 * syncs are then continued (a cheap no-op when nothing is queued).
 */
export async function handleWebsiteSyncCron(
  request: Request,
  { startDue }: { startDue: boolean }
): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  if (!isCronAuthorized(request, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();

  try {
    const started = startDue ? await startDueWebsiteSyncs() : [];
    const batch = await runWebsiteSyncBatch({
      timeBudgetMs: TIME_BUDGET_MS - (Date.now() - startedAt),
    });
    return NextResponse.json({
      started: started.filter((r) => r.started).length,
      startErrors: started.filter((r) => !r.started && r.reason === "error").length,
      ...batch,
    });
  } catch (caught: unknown) {
    const message = caught instanceof Error ? caught.message : "Unknown sync failure";
    console.error("[cron/sync-websites]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
