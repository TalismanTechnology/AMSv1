"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSchoolAdmin } from "@/lib/auth/require-school-admin";
import { logAudit } from "@/lib/audit";
import { syncSchoolCalendars, type SchoolSyncSummary } from "@/lib/blackbaud/calendar";
import {
  publishStagedEvents,
  rejectStagedEvents as rejectStaged,
} from "@/lib/blackbaud/publish";
import { fetchFeedText, normalizeFeedUrl } from "@/lib/blackbaud/safe-fetch";
import { parseFeed } from "@/lib/blackbaud/ical";
import { isValidTimeZone } from "@/lib/blackbaud/timezone";
import { normalizeSourceValue } from "@/lib/blackbaud/tagging";

// Server actions behind the Blackbaud calendar panel. Every entry point
// re-authorizes against the school id it was handed — the client supplies that
// id, so being an admin elsewhere must not be enough.

const FeedSchema = z.object({
  label: z.string().trim().min(1, "Give the feed a name.").max(80),
  url: z.string().trim().min(1, "Paste the feed URL."),
  timezone: z.string().trim().min(1),
});

export interface FeedActionResult {
  error?: string;
  success?: boolean;
  /** Number of events the URL check found, so the admin knows it works. */
  previewCount?: number;
}

/**
 * Add an iCal feed, verifying it before saving.
 *
 * The check is the whole point: a typo'd or expired subscription URL saved
 * silently would look connected and then quietly sync nothing.
 */
export async function addCalendarFeed(
  schoolId: string,
  input: { label: string; url: string; timezone: string }
): Promise<FeedActionResult> {
  const auth = await requireSchoolAdmin(schoolId);
  if ("error" in auth) return { error: auth.error };

  const parsed = FeedSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid feed details." };
  }

  if (!isValidTimeZone(parsed.data.timezone)) {
    return { error: "That is not a recognized time zone." };
  }

  const url = normalizeFeedUrl(parsed.data.url);
  let previewCount = 0;

  try {
    const text = await fetchFeedText(url);
    const now = Date.now();
    previewCount = parseFeed(text, {
      timezone: parsed.data.timezone,
      windowStart: new Date(now - 30 * 86_400_000),
      windowEnd: new Date(now + 400 * 86_400_000),
    }).length;
  } catch (caught: unknown) {
    const message =
      caught instanceof Error ? caught.message : "Could not read that feed.";
    return { error: message };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("blackbaud_calendar_feeds").insert({
    school_id: schoolId,
    label: parsed.data.label,
    url,
    timezone: parsed.data.timezone,
    created_by: auth.userId,
  });

  if (error) {
    return {
      error: error.code === "23505"
        ? "That feed is already connected."
        : error.message,
    };
  }

  logAudit(auth.userId, "add_blackbaud_feed", "blackbaud_calendar_feed", undefined, {
    label: parsed.data.label,
    previewCount,
  }, schoolId);

  revalidatePath("/", "layout");
  return { success: true, previewCount };
}

export async function updateCalendarFeed(
  schoolId: string,
  feedId: string,
  changes: { label?: string; timezone?: string; isActive?: boolean }
): Promise<FeedActionResult> {
  const auth = await requireSchoolAdmin(schoolId);
  if ("error" in auth) return { error: auth.error };

  if (changes.timezone && !isValidTimeZone(changes.timezone)) {
    return { error: "That is not a recognized time zone." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("blackbaud_calendar_feeds")
    .update({
      ...(changes.label !== undefined ? { label: changes.label.trim() } : {}),
      ...(changes.timezone !== undefined ? { timezone: changes.timezone } : {}),
      ...(changes.isActive !== undefined ? { is_active: changes.isActive } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", feedId)
    .eq("school_id", schoolId);

  if (error) return { error: error.message };

  logAudit(auth.userId, "update_blackbaud_feed", "blackbaud_calendar_feed", feedId, changes, schoolId);
  revalidatePath("/", "layout");
  return { success: true };
}

/**
 * Remove a feed. Staged rows cascade; anything already published stays on the
 * calendar, because parents may already have planned around it.
 */
export async function deleteCalendarFeed(
  schoolId: string,
  feedId: string
): Promise<FeedActionResult> {
  const auth = await requireSchoolAdmin(schoolId);
  if ("error" in auth) return { error: auth.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("blackbaud_calendar_feeds")
    .delete()
    .eq("id", feedId)
    .eq("school_id", schoolId);

  if (error) return { error: error.message };

  logAudit(auth.userId, "delete_blackbaud_feed", "blackbaud_calendar_feed", feedId, undefined, schoolId);
  revalidatePath("/", "layout");
  return { success: true };
}

export interface SyncActionResult {
  error?: string;
  success?: boolean;
  summary?: SchoolSyncSummary;
}

/** Run a sync now, rather than waiting for the scheduled one. */
export async function syncCalendarsNow(
  schoolId: string
): Promise<SyncActionResult> {
  const auth = await requireSchoolAdmin(schoolId);
  if ("error" in auth) return { error: auth.error };

  try {
    const summary = await syncSchoolCalendars(schoolId);

    logAudit(auth.userId, "sync_blackbaud_calendar", "school", schoolId, {
      feeds: summary.results.length,
      failures: summary.failures.length,
    }, schoolId);

    revalidatePath("/", "layout");
    return { success: true, summary };
  } catch (caught: unknown) {
    const message =
      caught instanceof Error ? caught.message : "Calendar sync failed";
    return { error: message };
  }
}

export interface ReviewActionResult {
  error?: string;
  success?: boolean;
  eventsCreated?: number;
  count?: number;
}

const IdsSchema = z.array(z.string().uuid()).min(1).max(1000);

/** Publish reviewed occurrences onto the parent calendar. */
export async function approveStagedEvents(
  schoolId: string,
  stagedIds: string[]
): Promise<ReviewActionResult> {
  const auth = await requireSchoolAdmin(schoolId);
  if ("error" in auth) return { error: auth.error };

  const parsed = IdsSchema.safeParse(stagedIds);
  if (!parsed.success) return { error: "Select at least one event." };

  try {
    const result = await publishStagedEvents(schoolId, parsed.data, auth.userId);

    logAudit(auth.userId, "approve_blackbaud_events", "event", undefined, {
      staged: result.staged,
      eventsCreated: result.eventsCreated,
    }, schoolId);

    revalidatePath("/", "layout");
    return {
      success: true,
      count: result.staged,
      eventsCreated: result.eventsCreated,
    };
  } catch (caught: unknown) {
    const message = caught instanceof Error ? caught.message : "Approval failed";
    return { error: message };
  }
}

export async function rejectStagedEventsAction(
  schoolId: string,
  stagedIds: string[]
): Promise<ReviewActionResult> {
  const auth = await requireSchoolAdmin(schoolId);
  if ("error" in auth) return { error: auth.error };

  const parsed = IdsSchema.safeParse(stagedIds);
  if (!parsed.success) return { error: "Select at least one event." };

  try {
    const result = await rejectStaged(schoolId, parsed.data, auth.userId);

    logAudit(auth.userId, "reject_blackbaud_events", "event", undefined, {
      count: result.rejected,
    }, schoolId);

    revalidatePath("/", "layout");
    return { success: true, count: result.rejected };
  } catch (caught: unknown) {
    const message = caught instanceof Error ? caught.message : "Rejection failed";
    return { error: message };
  }
}

/**
 * Correct the tags on a staged occurrence.
 *
 * `remember` turns the correction into a mapping rule keyed on the event's own
 * feed categories, so the next sync tags the same kind of event without asking
 * the model. This is the loop that makes auto-tagging improve over a season
 * instead of repeating the same mistake nightly.
 */
export async function updateStagedEventTags(
  schoolId: string,
  stagedId: string,
  calendarIds: string[],
  remember = true
): Promise<ReviewActionResult> {
  const auth = await requireSchoolAdmin(schoolId);
  if ("error" in auth) return { error: auth.error };

  const parsed = z.array(z.string().uuid()).max(50).safeParse(calendarIds);
  if (!parsed.success) return { error: "Invalid calendar selection." };

  const supabase = createAdminClient();

  const { data: staged } = await supabase
    .from("blackbaud_events")
    .select("id, feed_id, raw_categories")
    .eq("id", stagedId)
    .eq("school_id", schoolId)
    .maybeSingle();

  if (!staged) return { error: "That event is no longer in the queue." };

  // Only calendars belonging to this school may be attached.
  const { data: valid } = await supabase
    .from("event_calendars")
    .select("id")
    .eq("school_id", schoolId)
    .in("id", parsed.data.length > 0 ? parsed.data : ["00000000-0000-0000-0000-000000000000"]);

  const allowed = (valid ?? []).map((row) => row.id as string);

  await supabase
    .from("blackbaud_event_calendar_suggestions")
    .delete()
    .eq("blackbaud_event_id", stagedId);

  if (allowed.length > 0) {
    await supabase.from("blackbaud_event_calendar_suggestions").insert(
      allowed.map((calendar_id) => ({
        blackbaud_event_id: stagedId,
        calendar_id,
      }))
    );
  }

  await supabase
    .from("blackbaud_events")
    .update({ tag_source: "mapping", tag_confidence: 1 })
    .eq("id", stagedId);

  if (remember && allowed.length > 0) {
    const categories = (staged.raw_categories ?? []) as string[];
    const rules = categories.flatMap((category) => {
      const value = normalizeSourceValue(category);
      if (!value) return [];
      return allowed.map((calendar_id) => ({
        school_id: schoolId,
        source_kind: "ical_category" as const,
        source_value: value,
        calendar_id,
      }));
    });

    if (rules.length > 0) {
      await supabase
        .from("blackbaud_calendar_mappings")
        .upsert(rules, {
          onConflict: "school_id,source_kind,source_value,calendar_id",
          ignoreDuplicates: true,
        });
    }
  }

  logAudit(auth.userId, "retag_blackbaud_event", "event", stagedId, {
    calendarIds: allowed,
    remember,
  }, schoolId);

  revalidatePath("/", "layout");
  return { success: true };
}

/** Map a whole feed onto calendars — the strongest tag signal available. */
export async function setFeedCalendarMapping(
  schoolId: string,
  feedId: string,
  calendarIds: string[]
): Promise<FeedActionResult> {
  const auth = await requireSchoolAdmin(schoolId);
  if ("error" in auth) return { error: auth.error };

  const parsed = z.array(z.string().uuid()).max(50).safeParse(calendarIds);
  if (!parsed.success) return { error: "Invalid calendar selection." };

  const supabase = await createClient();

  await supabase
    .from("blackbaud_calendar_mappings")
    .delete()
    .eq("school_id", schoolId)
    .eq("source_kind", "feed")
    .eq("source_value", feedId);

  if (parsed.data.length > 0) {
    const { error } = await supabase.from("blackbaud_calendar_mappings").insert(
      parsed.data.map((calendar_id) => ({
        school_id: schoolId,
        source_kind: "feed",
        source_value: feedId,
        calendar_id,
      }))
    );

    if (error) return { error: error.message };
  }

  logAudit(auth.userId, "map_blackbaud_feed", "blackbaud_calendar_feed", feedId, {
    calendarIds: parsed.data,
  }, schoolId);

  revalidatePath("/", "layout");
  return { success: true };
}
