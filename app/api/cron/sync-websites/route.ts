import { handleWebsiteSyncCron } from "@/lib/website/cron";

export const maxDuration = 300;

// Continue any running website syncs (every few minutes; no-op when idle).
//   GET /api/cron/sync-websites
//   Authorization: Bearer <CRON_SECRET>   (or ?key=<CRON_SECRET>)
// New runs are started daily by /api/cron/sync-websites/start.
export async function GET(request: Request) {
  return handleWebsiteSyncCron(request, { startDue: false });
}
