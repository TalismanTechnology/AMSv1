"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSchoolAdmin } from "@/lib/auth/require-school-admin";
import { logAudit } from "@/lib/audit";
import { normalizeUrl } from "@/lib/website/url";
import { deleteWebsiteDocumentsForSource } from "@/lib/website/documents";
import { runWebsiteSyncBatch, startWebsiteSync } from "@/lib/website/sync";

// Server actions behind the "Website" tab in admin settings. Every entry point
// re-authorizes against the specific school id it was handed, and every query
// is scoped to that school, so a source id from another school does nothing.

export interface WebsiteSourceInput {
  rootUrl: string;
  includePatterns: string[];
  excludePatterns: string[];
  maxPages: number;
  enabled: boolean;
}

const MAX_PAGES_LIMIT = 2000;

// "Sync now" crawls for this long after responding; the */10 cron carries on
// from there. Kept under the website settings page's maxDuration (300s).
const SYNC_NOW_BUDGET_MS = 240_000;

function cleanPatterns(patterns: string[]): string[] {
  return [...new Set(patterns.map((p) => p.trim()).filter(Boolean))].slice(0, 100);
}

function validate(input: WebsiteSourceInput): { error: string } | { row: Record<string, unknown> } {
  const raw = input.rootUrl.trim();
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const rootUrl = normalizeUrl(withScheme);
  if (!rootUrl || !new URL(rootUrl).hostname.includes(".")) {
    return { error: "Enter the website's address, e.g. https://www.yourschool.org" };
  }
  const maxPages = Math.round(Number(input.maxPages));
  if (!Number.isFinite(maxPages) || maxPages < 1 || maxPages > MAX_PAGES_LIMIT) {
    return { error: `Max pages must be between 1 and ${MAX_PAGES_LIMIT}.` };
  }
  return {
    row: {
      root_url: rootUrl,
      include_patterns: cleanPatterns(input.includePatterns),
      exclude_patterns: cleanPatterns(input.excludePatterns),
      max_pages: maxPages,
      enabled: !!input.enabled,
    },
  };
}

function friendlyDbError(message: string): string {
  if (/duplicate key|unique/i.test(message)) return "That website is already added.";
  if (/website_sources/.test(message) && /does not exist|schema cache/i.test(message)) {
    return "Website sources aren't set up yet: apply migration 038_website_sources.sql.";
  }
  return message;
}

export async function createWebsiteSource(
  schoolId: string,
  input: WebsiteSourceInput
): Promise<{ error?: string; id?: string }> {
  const auth = await requireSchoolAdmin(schoolId);
  if ("error" in auth) return { error: auth.error };

  const checked = validate(input);
  if ("error" in checked) return checked;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("website_sources")
    .insert({ ...checked.row, school_id: schoolId })
    .select("id")
    .single();
  if (error || !data) return { error: friendlyDbError(error?.message ?? "Could not add website") };

  logAudit(auth.userId, "create_website_source", "website_source", data.id, { rootUrl: checked.row.root_url }, schoolId);
  revalidatePath("/", "layout");
  return { id: data.id };
}

export async function updateWebsiteSource(
  schoolId: string,
  sourceId: string,
  input: WebsiteSourceInput
): Promise<{ error?: string }> {
  const auth = await requireSchoolAdmin(schoolId);
  if ("error" in auth) return { error: auth.error };

  const checked = validate(input);
  if ("error" in checked) return checked;

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("website_sources")
    .select("id, last_sync_status")
    .eq("id", sourceId)
    .eq("school_id", schoolId)
    .maybeSingle();
  if (!current) return { error: "Website not found" };

  // Disabling stops a sync in progress; its queue is discarded.
  const cancelling = !checked.row.enabled && current.last_sync_status === "running";

  const { error } = await supabase
    .from("website_sources")
    .update({
      ...checked.row,
      ...(cancelling
        ? { last_sync_status: "cancelled", last_sync_finished_at: new Date().toISOString() }
        : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", sourceId)
    .eq("school_id", schoolId);
  if (error) return { error: friendlyDbError(error.message) };

  if (cancelling) {
    await createAdminClient().from("website_sync_queue").delete().eq("source_id", sourceId);
  }

  logAudit(auth.userId, "update_website_source", "website_source", sourceId, { rootUrl: checked.row.root_url }, schoolId);
  revalidatePath("/", "layout");
  return {};
}

/** Delete a source and every document it created (files, rows, chunks). */
export async function deleteWebsiteSource(
  schoolId: string,
  sourceId: string
): Promise<{ error?: string }> {
  const auth = await requireSchoolAdmin(schoolId);
  if ("error" in auth) return { error: auth.error };

  const admin = createAdminClient();
  const { data: source } = await admin
    .from("website_sources")
    .select("id, root_url")
    .eq("id", sourceId)
    .eq("school_id", schoolId)
    .maybeSingle();
  if (!source) return { error: "Website not found" };

  try {
    // Disable first so a batch already running stops picking up its queue.
    await admin
      .from("website_sources")
      .update({ enabled: false, last_sync_status: "cancelled" })
      .eq("id", sourceId);
    await deleteWebsiteDocumentsForSource(admin, schoolId, sourceId);
    const { error } = await admin
      .from("website_sources")
      .delete()
      .eq("id", sourceId)
      .eq("school_id", schoolId);
    if (error) throw new Error(error.message);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not delete website" };
  }

  logAudit(auth.userId, "delete_website_source", "website_source", sourceId, { rootUrl: source.root_url }, schoolId);
  revalidatePath("/", "layout");
  return {};
}

/**
 * Start a sync now (or nudge one already running) and crawl for a few minutes
 * after responding. The cron continues any remainder.
 */
export async function syncWebsiteSourceNow(
  schoolId: string,
  sourceId: string
): Promise<{ error?: string; alreadyRunning?: boolean }> {
  const auth = await requireSchoolAdmin(schoolId);
  if ("error" in auth) return { error: auth.error };

  const admin = createAdminClient();
  const { data: source } = await admin
    .from("website_sources")
    .select("id")
    .eq("id", sourceId)
    .eq("school_id", schoolId)
    .maybeSingle();
  if (!source) return { error: "Website not found" };

  const result = await startWebsiteSync(sourceId);
  if (!result.started) {
    if (result.reason === "error") return { error: result.error };
    if (result.reason === "disabled") return { error: "Turn this website on before syncing it." };
    if (result.reason === "not_found") return { error: "Website not found" };
  }

  logAudit(auth.userId, "sync_website_source", "website_source", sourceId, undefined, schoolId);

  // after() keeps the function alive past the response (fire-and-forget
  // fetches are dropped on Vercel when the function exits).
  after(async () => {
    try {
      await runWebsiteSyncBatch({ timeBudgetMs: SYNC_NOW_BUDGET_MS, sourceIds: [sourceId] });
    } catch (err) {
      console.error("[website] Sync-now batch failed:", err);
    }
  });

  revalidatePath("/", "layout");
  return { alreadyRunning: !result.started };
}
