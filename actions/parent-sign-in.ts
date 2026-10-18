"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSchoolAdmin } from "@/lib/auth/require-school-admin";
import { logAudit } from "@/lib/audit";
import { resolveAuthProvider, type AuthProvider } from "@/lib/auth/provider";
import { isNotInstalledError } from "@/lib/supabase/not-installed";
import { getVeracrossConnection } from "@/lib/veracross/connection";
import {
  MAX_ROSTER_BYTES,
  MAX_ROSTER_ROWS,
  parseRosterCsv,
  type RowIssue,
} from "@/lib/roster/csv";
import { getRosterSummary, previewRosterReplacement, replaceRoster } from "@/lib/roster/store";

// Server actions behind the "Parent sign-in" panel in admin settings: which
// provider parents use, the uploaded parent roster, and the optional
// require-roster-match gate. Every entry point re-authorizes against the
// *specific* school id it was handed (see actions/blackbaud.ts).

const NOT_INSTALLED = "Email-code sign-in isn't available yet. It will be after the next database update.";
const PROVIDERS: readonly AuthProvider[] = ["blackbaud", "veracross", "roster"];
// Issues returned to the browser; the full list stays in the server log.
const MAX_ISSUES_RETURNED = 50;

function message(caught: unknown, fallback: string): string {
  return caught instanceof Error ? caught.message : fallback;
}

async function activeRosterCount(schoolId: string): Promise<number | null> {
  const summary = await getRosterSummary(schoolId);
  return summary.installed ? summary.activeCount : null;
}

export async function updateParentSignInProvider(
  schoolId: string,
  provider: AuthProvider
): Promise<{ error?: string; success?: boolean }> {
  const auth = await requireSchoolAdmin(schoolId);
  if ("error" in auth) return { error: auth.error };

  if (!PROVIDERS.includes(provider)) return { error: "Unknown sign-in method." };

  try {
    if (provider === "veracross" && !(await getVeracrossConnection(schoolId))) {
      return { error: "Veracross isn't connected for this school yet." };
    }
    if (provider === "roster") {
      const count = await activeRosterCount(schoolId);
      if (count === null) return { error: NOT_INSTALLED };
      if (count === 0) {
        return { error: "Upload a parent roster before switching to email-code sign-in." };
      }
    }
  } catch (caught: unknown) {
    return { error: message(caught, "Could not check sign-in settings.") };
  }

  const admin = createAdminClient();
  const { data: before } = await admin.from("schools").select("*").eq("id", schoolId).maybeSingle();

  const { error } = await admin
    .from("schools")
    .update({ auth_provider: provider, updated_at: new Date().toISOString() })
    .eq("id", schoolId);

  if (error) {
    // 23514: the pre-044 check constraint doesn't allow 'roster' yet.
    if (provider === "roster" && (error.code === "23514" || isNotInstalledError(error))) {
      return { error: NOT_INSTALLED };
    }
    return { error: error.message };
  }

  logAudit(
    auth.userId,
    "update_parent_sign_in_provider",
    "school",
    schoolId,
    { from: resolveAuthProvider(before?.auth_provider), to: provider },
    schoolId
  );

  revalidatePath("/", "layout");
  return { success: true };
}

export interface UploadRosterResult {
  error?: string;
  success?: boolean;
  inserted?: number;
  updated?: number;
  deactivated?: number;
  activeCount?: number;
  skippedRows?: number;
  errors?: RowIssue[];
}

/**
 * Replaces the school's roster with this CSV. The file is parsed again here
 * (the browser preview is only a preview). Bad rows are skipped and reported;
 * a file with no usable rows is refused rather than deactivating everyone.
 */
export async function uploadRoster(
  schoolId: string,
  csvText: string
): Promise<UploadRosterResult> {
  const auth = await requireSchoolAdmin(schoolId);
  if ("error" in auth) return { error: auth.error };

  if (typeof csvText !== "string") return { error: "No file received." };
  // Cheap guard before parsing; parseRosterCsv checks the exact byte size.
  if (csvText.length > MAX_ROSTER_BYTES) return { error: "This file is larger than 2 MB." };

  const parsed = parseRosterCsv(csvText);
  if (parsed.fatal) return { error: parsed.fatal };
  if (parsed.parents.length === 0) {
    return {
      error: "No valid rows found, so nothing was changed.",
      errors: parsed.errors.slice(0, MAX_ISSUES_RETURNED),
    };
  }

  try {
    const result = await replaceRoster(schoolId, parsed.parents);
    if (!result.installed) return { error: NOT_INSTALLED };

    logAudit(
      auth.userId,
      "upload_parent_roster",
      "school_roster",
      schoolId,
      {
        parents: parsed.parents.length,
        inserted: result.inserted,
        updated: result.updated,
        deactivated: result.deactivated,
        skipped_rows: parsed.errors.length,
      },
      schoolId
    );

    revalidatePath("/", "layout");
    return {
      success: true,
      inserted: result.inserted,
      updated: result.updated,
      deactivated: result.deactivated,
      activeCount: parsed.parents.length,
      skippedRows: parsed.errors.length,
      errors: parsed.errors.slice(0, MAX_ISSUES_RETURNED),
    };
  } catch (caught: unknown) {
    console.error(`[roster] Upload failed for school ${schoolId}: ${message(caught, "unknown")}`);
    return { error: "The roster couldn't be saved. Please try again." };
  }
}

/** Toggle schools.require_roster_match (migration 044). */
export async function updateRequireRosterMatch(
  schoolId: string,
  enabled: boolean
): Promise<{ error?: string; success?: boolean }> {
  const auth = await requireSchoolAdmin(schoolId);
  if ("error" in auth) return { error: auth.error };

  if (typeof enabled !== "boolean") return { error: "Invalid setting." };

  if (enabled) {
    try {
      const count = await activeRosterCount(schoolId);
      if (count === null) return { error: NOT_INSTALLED };
      if (count === 0) {
        return {
          error: "Upload a parent roster first — otherwise no parent could sign in.",
        };
      }
    } catch (caught: unknown) {
      return { error: message(caught, "Could not read the roster.") };
    }
  }

  const { error } = await createAdminClient()
    .from("schools")
    .update({ require_roster_match: enabled, updated_at: new Date().toISOString() })
    .eq("id", schoolId);

  if (error) {
    return { error: isNotInstalledError(error) ? NOT_INSTALLED : error.message };
  }

  logAudit(
    auth.userId,
    "update_require_roster_match",
    "school",
    schoolId,
    { enabled },
    schoolId
  );

  revalidatePath("/", "layout");
  return { success: true };
}

/** Counts for the "Replace roster" confirmation. Writes nothing. */
export async function previewRosterUpload(
  schoolId: string,
  emails: string[]
): Promise<{ error?: string; inserted?: number; updated?: number; deactivated?: number }> {
  const auth = await requireSchoolAdmin(schoolId);
  if ("error" in auth) return { error: auth.error };

  if (!Array.isArray(emails) || emails.length > MAX_ROSTER_ROWS) {
    return { error: "Invalid roster." };
  }

  try {
    const preview = await previewRosterReplacement(
      schoolId,
      emails.filter((email): email is string => typeof email === "string")
    );
    if (!preview.installed) return { error: NOT_INSTALLED };
    return {
      inserted: preview.inserted,
      updated: preview.updated,
      deactivated: preview.deactivated,
    };
  } catch (caught: unknown) {
    return { error: message(caught, "Could not read the roster.") };
  }
}
