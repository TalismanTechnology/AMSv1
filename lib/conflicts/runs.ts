// Scan-run shapes shared by the server and the admin page's client code (so
// this file imports nothing server-only).

export type ScanTrigger = "manual" | "cron" | "script";

export interface ScanRunSummary {
  id: string;
  trigger: ScanTrigger;
  status: "running" | "completed" | "failed";
  started_at: string;
  finished_at: string | null;
  documents_scanned: number;
  pairs_considered: number;
  pairs_judged: number;
  conflicts_found: number;
  error: string | null;
}

/** A run still "running" after this long died with its function. */
export const STALE_RUN_MS = 15 * 60 * 1000;

export function isRunActive(run: ScanRunSummary | null, now = Date.now()): boolean {
  return !!run && run.status === "running" && now - new Date(run.started_at).getTime() < STALE_RUN_MS;
}

