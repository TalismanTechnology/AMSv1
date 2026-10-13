import { handleWebsiteSyncCron } from "@/lib/website/cron";

export const maxDuration = 300;

// Daily: start a new sync run for every enabled website source not started in
// ~20h, then work the queue like the continuation cron does.
//   GET /api/cron/sync-websites/start
//   Authorization: Bearer <CRON_SECRET>   (or ?key=<CRON_SECRET>)
export async function GET(request: Request) {
  return handleWebsiteSyncCron(request, { startDue: true });
}
