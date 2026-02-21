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

  const { error } = await supabase.from("events").insert(rows);

  if (error) return { error: error.message };

  logAudit(user.id, "create_event", "event", undefined, {
    title,
    recurrence,
    count: dates.length,
  }, schoolId);

  revalidatePath("/", "layout");
  return { success: true };
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
  }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("events")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", eventId)
    .eq("school_id", schoolId);

  if (error) return { error: error.message };

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
