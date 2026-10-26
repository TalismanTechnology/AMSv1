"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";
import { getDocumentText } from "@/lib/documents/get-document-text";
import {
  extractCalendarEvents,
  type ExtractedEvent,
} from "@/lib/ai/event-extraction";

// ── Extract events from an uploaded document ─────────

export async function extractEventsFromDocument(
  schoolId: string,
  documentId: string
): Promise<{ events?: ExtractedEvent[]; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: doc, error: docError } = await supabase
    .from("documents")
    .select("id, school_id, title, text_url, status")
    .eq("id", documentId)
    .eq("school_id", schoolId)
    .single();

  if (docError || !doc) return { error: "Document not found" };
  if (doc.status !== "ready")
    return { error: "This document is still processing. Try again shortly." };

  const text = await getDocumentText(supabase, doc);
  if (!text) return { error: "Couldn't read any text from this document." };

  // Events are filed under labels now, which the admin picks while
  // reviewing, so the model isn't asked to suggest divisions or categories.
  try {
    const events = await extractCalendarEvents(text, { calendars: [] });
    if (events.length === 0)
      return { error: "No calendar events were found in this document." };
    return { events };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Extraction failed";
    return { error: message };
  }
}

// ── Bulk-create reviewed events ──────────────────────

const BulkEventSchema = z.object({
  title: z.string().trim().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  allDay: z.boolean(),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  location: z.string().nullable(),
  eventType: z.enum([
    "general",
    "academic",
    "sports",
    "arts",
    "meeting",
    "holiday",
    "other",
  ]),
  description: z.string().nullable(),
  labelId: z.string().uuid().nullable(),
});

export type BulkEventInput = z.infer<typeof BulkEventSchema>;

// Cap how many days a single span can expand to, so a bad
// end date can't insert thousands of rows.
const MAX_SPAN_DAYS = 60;

function expandDates(start: string, end: string | null): string[] {
  if (!end || end <= start) return [start];
  const dates: string[] = [];
  const current = new Date(start + "T00:00:00");
  const last = new Date(end + "T00:00:00");
  while (current <= last && dates.length < MAX_SPAN_DAYS) {
    dates.push(current.toISOString().split("T")[0]);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

export async function createEventsBulk(
  schoolId: string,
  events: BulkEventInput[]
): Promise<{ success?: true; count?: number; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const parsed = z.array(BulkEventSchema).safeParse(events);
  if (!parsed.success) return { error: "Some events are invalid." };
  if (parsed.data.length === 0) return { error: "No events selected." };

  // Only this school's labels are kept.
  const { data: schoolLabels, error: labelError } = await supabase
    .from("calendar_labels")
    .select("id")
    .eq("school_id", schoolId);
  if (labelError) return { error: "Couldn't check the labels. Please try again." };
  const labelIds = new Set((schoolLabels ?? []).map((l) => l.id as string));

  // Flatten each reviewed event into one row per day.
  const rows: Record<string, unknown>[] = [];

  for (const ev of parsed.data) {
    const labelId = ev.labelId && labelIds.has(ev.labelId) ? ev.labelId : null;
    for (const date of expandDates(ev.date, ev.endDate)) {
      rows.push({
        title: ev.title.trim(),
        description: ev.description || null,
        date,
        start_time: ev.allDay ? null : ev.startTime || null,
        end_time: ev.allDay ? null : ev.endTime || null,
        location: ev.location || null,
        event_type: ev.eventType,
        created_by: user.id,
        school_id: schoolId,
        label_id: labelId,
      });
    }
  }

  const { error } = await supabase.from("events").insert(rows);

  if (error) return { error: error.message };

  logAudit(
    user.id,
    "import_events",
    "event",
    undefined,
    { count: rows.length, sourceEvents: parsed.data.length },
    schoolId
  );

  revalidatePath("/", "layout");
  return { success: true, count: rows.length };
}
