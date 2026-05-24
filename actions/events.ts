"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";

export async function createEvent(schoolId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const date = formData.get("date") as string;
  const start_time = formData.get("start_time") as string;
  const end_time = formData.get("end_time") as string;
  const location = formData.get("location") as string;
  const event_type = formData.get("event_type") as string;
  const recurrence = (formData.get("recurrence") as string) || "none";
  const recurrence_end = formData.get("recurrence_end") as string;
  const calendarIds = parseCalendarIds(formData.get("calendar_ids"));

  if (!title || !date) return { error: "Title and date are required" };

  // Generate recurring event dates if needed
  const dates = generateRecurrenceDates(date, recurrence, recurrence_end);

  const rows = dates.map((d) => ({
    title,
    description: description || null,
    date: d,
    start_time: start_time || null,
    end_time: end_time || null,
    location: location || null,
    event_type: event_type || "general",
    recurrence,
    recurrence_end: recurrence_end || null,
    created_by: user.id,
    school_id: schoolId,
  }));

  const { data: inserted, error } = await supabase
    .from("events")
    .insert(rows)
    .select("id");

  if (error) return { error: error.message };

  // Tag every generated occurrence with the chosen calendars.
  if (calendarIds.length > 0 && inserted) {
    const links = inserted.flatMap((e) =>
      calendarIds.map((calendar_id) => ({ event_id: e.id, calendar_id }))
    );
    const { error: linkError } = await supabase
      .from("event_calendar_links")
      .insert(links);
    if (linkError) return { error: linkError.message };
  }

  logAudit(user.id, "create_event", "event", undefined, {
    title,
    recurrence,
    count: dates.length,
  }, schoolId);

  revalidatePath("/", "layout");
  return { success: true };
}

// The event form serializes selected calendar ids as a
// JSON array string in the "calendar_ids" form field.
function parseCalendarIds(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

function generateRecurrenceDates(
  startDate: string,
  recurrence: string,
  endDateStr: string
): string[] {
  if (recurrence === "none" || !recurrence) return [startDate];

  const start = new Date(startDate);
  const end = endDateStr
    ? new Date(endDateStr)
    : new Date(start.getFullYear() + 1, start.getMonth(), start.getDate());
  const dates: string[] = [];
  const current = new Date(start);

  while (current <= end && dates.length < 365) {
    dates.push(current.toISOString().split("T")[0]);
    switch (recurrence) {
      case "daily":
        current.setDate(current.getDate() + 1);
        break;
      case "weekly":
        current.setDate(current.getDate() + 7);
        break;
      case "monthly":
        current.setMonth(current.getMonth() + 1);
        break;
      case "yearly":
        current.setFullYear(current.getFullYear() + 1);
        break;
      default:
        return dates;
    }
  }

  return dates;
}

export async function updateEvent(
  eventId: string,
  schoolId: string,
  data: {
    title?: string;
    description?: string | null;
    date?: string;
    start_time?: string | null;
    end_time?: string | null;
    location?: string | null;
    event_type?: string;
    calendar_ids?: string[];
  }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { calendar_ids, ...eventFields } = data;

  const { error } = await supabase
    .from("events")
    .update({ ...eventFields, updated_at: new Date().toISOString() })
    .eq("id", eventId)
    .eq("school_id", schoolId);

  if (error) return { error: error.message };

  // Replace the calendar tag set when the caller supplied one.
  if (calendar_ids !== undefined) {
    await supabase
      .from("event_calendar_links")
      .delete()
      .eq("event_id", eventId);
    if (calendar_ids.length > 0) {
      const { error: linkError } = await supabase
        .from("event_calendar_links")
        .insert(
          calendar_ids.map((calendar_id) => ({ event_id: eventId, calendar_id }))
        );
      if (linkError) return { error: linkError.message };
    }
  }

  if (user) logAudit(user.id, "update_event", "event", eventId, data, schoolId);

  revalidatePath("/", "layout");
  return { success: true };
}

export async function deleteEvent(eventId: string, schoolId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("events")
    .delete()
    .eq("id", eventId)
    .eq("school_id", schoolId);

  if (error) return { error: error.message };

  if (user) logAudit(user.id, "delete_event", "event", eventId, undefined, schoolId);

  revalidatePath("/", "layout");
  return { success: true };
}
