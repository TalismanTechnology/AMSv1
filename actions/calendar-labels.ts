"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSchoolAdmin } from "@/lib/auth/require-school-admin";
import { logAudit } from "@/lib/audit";
import { syncFeed, syncSchoolCalendars } from "@/lib/blackbaud/calendar";
import { unpublishStagedEvents } from "@/lib/blackbaud/publish";
import { fetchFeedText, normalizeFeedUrl } from "@/lib/blackbaud/safe-fetch";
import { parseFeed } from "@/lib/blackbaud/ical";
import { isValidTimeZone } from "@/lib/blackbaud/timezone";
import { CALENDAR_COLOR_PALETTE } from "@/lib/event-calendars";
import { selectAll } from "@/lib/supabase/select-all";

// Server actions behind the Labels panel on the admin Events page. A label is
// a name and color for events; one with an iCal link syncs that calendar's
// events in under it. Every entry point re-authorizes against the school id it
// was handed — the client supplies that id, so being an admin elsewhere must
// not be enough.

export interface LabelActionResult {
  error?: string;
  success?: boolean;
  /** Events the link's first sync put on the calendar. */
  published?: number;
  /** Set when the label saved but its first sync failed. */
  syncError?: string;
}

const NameSchema = z.string().trim().min(1, "Give the label a name.").max(80);
const ColorSchema = z.enum(CALENDAR_COLOR_PALETTE);
const IdSchema = z.string().uuid();

const LinkSchema = z.object({
  url: z.string().trim().min(1, "Paste the iCal link."),
  timezone: z.string().trim().min(1),
});

type LinkInput = z.infer<typeof LinkSchema>;

const CreateSchema = z.object({
  name: NameSchema,
  color: ColorSchema,
  link: LinkSchema.nullable(),
});

function messageOf(caught: unknown, fallback: string): string {
  return caught instanceof Error ? caught.message : fallback;
}

/**
 * Check an iCal link before anything is saved. A typo'd or expired link saved
 * silently would look connected and then quietly sync nothing.
 */
async function verifyLink(link: LinkInput): Promise<{ url: string } | { error: string }> {
  if (!isValidTimeZone(link.timezone)) {
    return { error: "That is not a recognized time zone." };
  }

  const url = normalizeFeedUrl(link.url);
  try {
    const text = await fetchFeedText(url);
    parseFeed(text, {
      timezone: link.timezone,
      windowStart: new Date(),
      windowEnd: new Date(),
    });
    return { url };
  } catch (caught: unknown) {
    return { error: messageOf(caught, "Could not read that link.") };
  }
}

/** Save a link for a label and run its first sync so events show up now. */
async function attachLink(
  schoolId: string,
  labelId: string,
  labelName: string,
  url: string,
  timezone: string,
  userId: string
): Promise<LabelActionResult> {
  const supabase = await createClient();
  const { data: feed, error } = await supabase
    .from("blackbaud_calendar_feeds")
    .insert({
      school_id: schoolId,
      label_id: labelId,
      label: labelName,
      url,
      timezone,
      created_by: userId,
    })
    .select("id, school_id, label_id, label, url, timezone")
    .single();

  if (error || !feed) {
    return {
      error: error?.code === "23505"
        ? "Another label already uses that link."
        : error?.message ?? "Could not save the link.",
    };
  }

  try {
    const result = await syncFeed(feed);
    return { success: true, published: result.published };
  } catch (caught: unknown) {
    const message = messageOf(caught, "The first sync failed.");
    await supabase
      .from("blackbaud_calendar_feeds")
      .update({ last_error: message, updated_at: new Date().toISOString() })
      .eq("id", feed.id);
    return { success: true, syncError: message };
  }
}

/** Take a label's synced events off the calendar and drop its link. */
async function detachLink(schoolId: string, labelId: string): Promise<string | null> {
  const admin = createAdminClient();

  const { data: feed, error: feedError } = await admin
    .from("blackbaud_calendar_feeds")
    .select("id")
    .eq("school_id", schoolId)
    .eq("label_id", labelId)
    .maybeSingle();
  if (feedError) return feedError.message;
  if (!feed) return null;

  try {
    const staged = await selectAll<{ id: string }>((from, to) =>
      admin.from("blackbaud_events").select("id").eq("feed_id", feed.id).order("id").range(from, to)
    );
    await unpublishStagedEvents(staged.map((row) => row.id));
  } catch (caught: unknown) {
    return messageOf(caught, "Could not remove the synced events.");
  }

  // Staged rows cascade with the feed.
  const { error } = await admin.from("blackbaud_calendar_feeds").delete().eq("id", feed.id);
  return error?.message ?? null;
}

export async function createLabel(
  schoolId: string,
  input: { name: string; color: string; link: LinkInput | null }
): Promise<LabelActionResult> {
  const auth = await requireSchoolAdmin(schoolId);
  if ("error" in auth) return { error: auth.error };

  const parsed = CreateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid label." };
  }

  const verified = parsed.data.link ? await verifyLink(parsed.data.link) : null;
  if (verified && "error" in verified) return { error: verified.error };

  const supabase = await createClient();
  const { count } = await supabase
    .from("calendar_labels")
    .select("id", { count: "exact", head: true })
    .eq("school_id", schoolId);

  const { data: label, error } = await supabase
    .from("calendar_labels")
    .insert({
      school_id: schoolId,
      name: parsed.data.name,
      color: parsed.data.color,
      sort_order: count ?? 0,
    })
    .select("id")
    .single();

  if (error || !label) {
    return {
      error: error?.code === "23505"
        ? "A label with that name already exists."
        : error?.message ?? "Could not create the label.",
    };
  }

  let result: LabelActionResult = { success: true };
  if (verified && parsed.data.link) {
    result = await attachLink(
      schoolId,
      label.id,
      parsed.data.name,
      verified.url,
      parsed.data.link.timezone,
      auth.userId
    );
    // The link was the point of this label; don't leave a half-made one.
    if (result.error) {
      await supabase.from("calendar_labels").delete().eq("id", label.id);
      return result;
    }
  }

  logAudit(auth.userId, "create_calendar_label", "calendar_label", label.id, {
    name: parsed.data.name,
    hasLink: !!parsed.data.link,
    published: result.published,
  }, schoolId);

  revalidatePath("/", "layout");
  return result;
}

export async function updateLabel(
  schoolId: string,
  labelId: string,
  changes: { name?: string; color?: string }
): Promise<LabelActionResult> {
  const auth = await requireSchoolAdmin(schoolId);
  if ("error" in auth) return { error: auth.error };

  const parsed = z
    .object({ id: IdSchema, name: NameSchema.optional(), color: ColorSchema.optional() })
    .safeParse({ id: labelId, ...changes });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid label." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("calendar_labels")
    .update({
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.color !== undefined ? { color: parsed.data.color } : {}),
    })
    .eq("id", labelId)
    .eq("school_id", schoolId);

  if (error) {
    return {
      error: error.code === "23505" ? "A label with that name already exists." : error.message,
    };
  }

  // The feed keeps a copy of the name for sync logs and errors.
  if (parsed.data.name !== undefined) {
    await supabase
      .from("blackbaud_calendar_feeds")
      .update({ label: parsed.data.name, updated_at: new Date().toISOString() })
      .eq("label_id", labelId)
      .eq("school_id", schoolId);
  }

  logAudit(auth.userId, "update_calendar_label", "calendar_label", labelId, changes, schoolId);
  revalidatePath("/", "layout");
  return { success: true };
}

/**
 * Add an iCal link to a label, or replace the one it has. Replacing takes the
 * old link's events off the calendar first, so the two calendars never mix.
 */
export async function setLabelLink(
  schoolId: string,
  labelId: string,
  link: LinkInput
): Promise<LabelActionResult> {
  const auth = await requireSchoolAdmin(schoolId);
  if ("error" in auth) return { error: auth.error };

  const parsed = LinkSchema.safeParse(link);
  if (!parsed.success || !IdSchema.safeParse(labelId).success) {
    return { error: parsed.error?.issues[0]?.message ?? "Invalid link." };
  }

  const supabase = await createClient();
  const { data: label } = await supabase
    .from("calendar_labels")
    .select("id, name")
    .eq("id", labelId)
    .eq("school_id", schoolId)
    .maybeSingle();
  if (!label) return { error: "That label no longer exists." };

  const verified = await verifyLink(parsed.data);
  if ("error" in verified) return { error: verified.error };

  // Check before detaching: once the old link is gone its events are too, so
  // the new one must not then fail on the (school_id, url) unique constraint.
  const { data: taken } = await supabase
    .from("blackbaud_calendar_feeds")
    .select("label_id")
    .eq("school_id", schoolId)
    .eq("url", verified.url)
    .maybeSingle();
  if (taken && taken.label_id !== labelId) {
    return { error: "Another label already uses that link." };
  }

  const detachError = await detachLink(schoolId, labelId);
  if (detachError) return { error: detachError };

  const result = await attachLink(
    schoolId,
    labelId,
    label.name,
    verified.url,
    parsed.data.timezone,
    auth.userId
  );

  if (result.success) {
    logAudit(auth.userId, "set_calendar_label_link", "calendar_label", labelId, {
      published: result.published,
    }, schoolId);
  }

  revalidatePath("/", "layout");
  return result;
}

/** Remove a label's iCal link and the events it synced. The label stays. */
export async function removeLabelLink(
  schoolId: string,
  labelId: string
): Promise<LabelActionResult> {
  const auth = await requireSchoolAdmin(schoolId);
  if ("error" in auth) return { error: auth.error };
  if (!IdSchema.safeParse(labelId).success) return { error: "Invalid label." };

  const error = await detachLink(schoolId, labelId);
  if (error) return { error };

  logAudit(auth.userId, "remove_calendar_label_link", "calendar_label", labelId, undefined, schoolId);
  revalidatePath("/", "layout");
  return { success: true };
}

/** Pause or resume syncing a label's link. Events already synced stay. */
export async function setLabelSyncPaused(
  schoolId: string,
  labelId: string,
  paused: boolean
): Promise<LabelActionResult> {
  const auth = await requireSchoolAdmin(schoolId);
  if ("error" in auth) return { error: auth.error };
  if (!IdSchema.safeParse(labelId).success) return { error: "Invalid label." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("blackbaud_calendar_feeds")
    .update({ is_active: !paused, updated_at: new Date().toISOString() })
    .eq("label_id", labelId)
    .eq("school_id", schoolId);

  if (error) return { error: error.message };

  logAudit(auth.userId, "pause_calendar_label_link", "calendar_label", labelId, { paused }, schoolId);
  revalidatePath("/", "layout");
  return { success: true };
}

/**
 * Delete a label. Events its link synced go with it; events added by hand
 * stay on the calendar with no label.
 */
export async function deleteLabel(
  schoolId: string,
  labelId: string
): Promise<LabelActionResult> {
  const auth = await requireSchoolAdmin(schoolId);
  if ("error" in auth) return { error: auth.error };
  if (!IdSchema.safeParse(labelId).success) return { error: "Invalid label." };

  const detachError = await detachLink(schoolId, labelId);
  if (detachError) return { error: detachError };

  const supabase = await createClient();
  const { error } = await supabase
    .from("calendar_labels")
    .delete()
    .eq("id", labelId)
    .eq("school_id", schoolId);

  if (error) return { error: error.message };

  logAudit(auth.userId, "delete_calendar_label", "calendar_label", labelId, undefined, schoolId);
  revalidatePath("/", "layout");
  return { success: true };
}

export interface SyncLabelsResult {
  error?: string;
  success?: boolean;
  /** Events added, changed or removed across every link. */
  changed?: number;
  failures?: Array<{ label: string; error: string }>;
}

/** Sync every active link now, rather than waiting for the scheduled run. */
export async function syncLabelsNow(schoolId: string): Promise<SyncLabelsResult> {
  const auth = await requireSchoolAdmin(schoolId);
  if ("error" in auth) return { error: auth.error };

  try {
    const summary = await syncSchoolCalendars(schoolId);

    logAudit(auth.userId, "sync_calendar_labels", "school", schoolId, {
      links: summary.results.length,
      failures: summary.failures.length,
    }, schoolId);

    revalidatePath("/", "layout");
    return {
      success: true,
      changed: summary.results.reduce(
        (sum, r) => sum + r.created + r.updated + r.superseded,
        0
      ),
      failures: summary.failures.map((f) => ({ label: f.label, error: f.error })),
    };
  } catch (caught: unknown) {
    return { error: messageOf(caught, "Sync failed") };
  }
}
