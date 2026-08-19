"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncRoster } from "@/lib/blackbaud/roster";
import { requireSchoolAdmin } from "@/lib/auth/require-school-admin";
import { logAudit } from "@/lib/audit";

// Server actions backing the Blackbaud panel in admin settings. Every entry
// point re-authorizes against the *specific* school id it was handed — the
// client passes that id, so being an admin somewhere else must not be enough.

export interface SyncRosterResult {
  error?: string;
  success?: boolean;
  upserted?: number;
  deactivated?: number;
}

/**
 * Pull the parent roster from Blackbaud on demand.
 *
 * The nightly cron does the same thing; this exists so an admin can confirm a
 * fresh connection works without waiting a day. A failure is written back to
 * the connection row so the status panel shows the same error the cron would.
 */
export async function syncBlackbaudRoster(
  schoolId: string
): Promise<SyncRosterResult> {
  const auth = await requireSchoolAdmin(schoolId);
  if ("error" in auth) return { error: auth.error };

  try {
    const result = await syncRoster(schoolId);

    logAudit(
      auth.userId,
      "sync_blackbaud_roster",
      "blackbaud_connection",
      schoolId,
      { upserted: result.upserted, deactivated: result.deactivated },
      schoolId
    );

    revalidatePath("/", "layout");
    return {
      success: true,
      upserted: result.upserted,
      deactivated: result.deactivated,
    };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Roster sync failed";

    // Surface the failure through the same status columns the cron writes, so
    // the panel reads identically whether the sync was manual or scheduled.
    const admin = createAdminClient();
    await admin
      .from("blackbaud_connections")
      .update({
        status: "error",
        last_error: message,
        updated_at: new Date().toISOString(),
      })
      .eq("school_id", schoolId);

    revalidatePath("/", "layout");
    return { error: message };
  }
}

/**
 * Toggle schools.blackbaud_verification_enabled.
 *
 * Gates membership approval on a roster match: a parent authenticates however
 * the school allows, and the roster decides whether they are approved. Turning
 * it on without a connection would gate every approval on a roster that can
 * never be populated, so that combination is refused rather than saved.
 */
export async function updateBlackbaudVerification(
  schoolId: string,
  enabled: boolean
): Promise<{ error?: string; success?: boolean }> {
  const auth = await requireSchoolAdmin(schoolId);
  if ("error" in auth) return { error: auth.error };

  const supabase = await createClient();

  if (enabled) {
    const { data: connection } = await supabase
      .from("blackbaud_connection_status")
      .select("school_id")
      .eq("school_id", schoolId)
      .maybeSingle();

    if (!connection) {
      return {
        error:
          "Connect Blackbaud before requiring roster matching — otherwise no parent can be approved.",
      };
    }
  }

  const { error } = await supabase
    .from("schools")
    .update({
      blackbaud_verification_enabled: enabled,
      updated_at: new Date().toISOString(),
    })
    .eq("id", schoolId);

  if (error) return { error: error.message };

  logAudit(
    auth.userId,
    "update_blackbaud_verification",
    "school",
    schoolId,
    { enabled },
    schoolId
  );

  revalidatePath("/", "layout");
  return { success: true };
}
