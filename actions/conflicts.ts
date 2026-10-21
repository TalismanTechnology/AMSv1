"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSchoolAdmin } from "@/lib/auth/require-school-admin";
import { logAudit } from "@/lib/audit";
import { isNotInstalledError } from "@/lib/supabase/not-installed";
import { CONFLICTS_NOT_INSTALLED_MESSAGE } from "@/lib/conflicts/store";
import {
  DEFAULT_MAX_JUDGED,
  isRunActive,
  latestScanRun,
  scanSchoolConflicts,
  startScanRun,
} from "@/lib/conflicts/scan";

// Server actions behind Admin > Conflicts. Every entry point re-authorizes
// against the school id it was handed, and every update is scoped to that
// school, so a conflict id from another school matches nothing. Rulings are
// written with the admin's own session (RLS: school admins and super admins
// only). Documents are never touched.

export type ConflictRuling = "a_correct" | "b_correct" | "custom";

const MAX_NOTE_LENGTH = 2000;
// The scan runs after the response; stop starting model calls before the
// function's maxDuration (the conflicts page sets 300s).
const SCAN_BUDGET_MS = 240_000;

function friendlyDbError(error: { code?: string; message: string }): string {
  if (isNotInstalledError(error)) return CONFLICTS_NOT_INSTALLED_MESSAGE;
  return error.message;
}

function revalidate() {
  revalidatePath("/", "layout");
}

/**
 * Start a conflict scan of the school's documents. Returns at once; the scan
 * runs in after() and the page polls the run row for progress.
 */
export async function scanConflicts(schoolId: string): Promise<{ error?: string; runId?: string }> {
  const auth = await requireSchoolAdmin(schoolId);
  if ("error" in auth) return { error: auth.error };

  const admin = createAdminClient();
  const latest = await latestScanRun(admin, schoolId);
  if (!latest.installed) return { error: CONFLICTS_NOT_INSTALLED_MESSAGE };
  if (isRunActive(latest.run)) return { error: "A scan is already running." };

  const started = await startScanRun(admin, schoolId, "manual", auth.userId);
  if ("notInstalled" in started) return { error: CONFLICTS_NOT_INSTALLED_MESSAGE };
  if ("error" in started) return { error: started.error };

  const deadline = Date.now() + SCAN_BUDGET_MS;
  after(async () => {
    const result = await scanSchoolConflicts(admin, schoolId, {
      write: true,
      trigger: "manual",
      runId: started.runId,
      requestedBy: auth.userId,
      maxJudged: DEFAULT_MAX_JUDGED,
      deadline,
    });
    if (result.error) console.error(`[conflicts] Manual scan for ${schoolId} failed:`, result.error);
  });

  logAudit(auth.userId, "conflict.scan", "conflict_scan_run", started.runId, undefined, schoolId);
  revalidate();
  return { runId: started.runId };
}

/** Rule on an open conflict: one document is right, or the admin writes the answer. */
export async function resolveConflict(
  schoolId: string,
  conflictId: string,
  resolution: ConflictRuling,
  note?: string
): Promise<{ error?: string }> {
  const auth = await requireSchoolAdmin(schoolId);
  if ("error" in auth) return { error: auth.error };
  if (resolution !== "a_correct" && resolution !== "b_correct" && resolution !== "custom") {
    return { error: "Invalid resolution." };
  }
  const adminNote = (note ?? "").trim();
  if (resolution === "custom" && !adminNote) return { error: "Write the correct answer first." };
  if (adminNote.length > MAX_NOTE_LENGTH) {
    return { error: `Keep the answer under ${MAX_NOTE_LENGTH} characters.` };
  }

  const now = new Date().toISOString();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("document_conflicts")
    .update({
      status: "resolved",
      resolution,
      admin_note: adminNote || null,
      resolved_by: auth.userId,
      resolved_at: now,
      updated_at: now,
    })
    .eq("id", conflictId)
    .eq("school_id", schoolId)
    .eq("status", "open")
    .select("id");
  if (error) return { error: friendlyDbError(error) };
  if (!data?.length) return { error: "Conflict not found, or already reviewed." };

  logAudit(auth.userId, "conflict.resolve", "document_conflict", conflictId, { resolution }, schoolId);
  revalidate();
  return {};
}

/** "Not a conflict": the documents don't really disagree. */
export async function dismissConflict(
  schoolId: string,
  conflictId: string
): Promise<{ error?: string }> {
  const auth = await requireSchoolAdmin(schoolId);
  if ("error" in auth) return { error: auth.error };

  const now = new Date().toISOString();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("document_conflicts")
    .update({
      status: "dismissed",
      resolution: null,
      resolved_by: auth.userId,
      resolved_at: now,
      updated_at: now,
    })
    .eq("id", conflictId)
    .eq("school_id", schoolId)
    .eq("status", "open")
    .select("id");
  if (error) return { error: friendlyDbError(error) };
  if (!data?.length) return { error: "Conflict not found, or already reviewed." };

  logAudit(auth.userId, "conflict.dismiss", "document_conflict", conflictId, undefined, schoolId);
  revalidate();
  return {};
}

/** Undo a ruling or dismissal: back to open, and out of parents' answers. */
export async function reopenConflict(
  schoolId: string,
  conflictId: string
): Promise<{ error?: string }> {
  const auth = await requireSchoolAdmin(schoolId);
  if ("error" in auth) return { error: auth.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("document_conflicts")
    .update({
      status: "open",
      resolution: null,
      admin_note: null,
      resolved_by: null,
      resolved_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conflictId)
    .eq("school_id", schoolId)
    .in("status", ["resolved", "dismissed"])
    .select("id");
  if (error) return { error: friendlyDbError(error) };
  if (!data?.length) return { error: "Conflict not found." };

  logAudit(auth.userId, "conflict.reopen", "document_conflict", conflictId, undefined, schoolId);
  revalidate();
  return {};
}
