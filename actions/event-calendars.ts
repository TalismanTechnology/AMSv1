"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";
import type { EventCalendar, EventCalendarKind } from "@/lib/types";

export async function createEventCalendar(
  schoolId: string,
  data: { kind: EventCalendarKind; name: string; color: string }
): Promise<{ calendar: EventCalendar } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const name = data.name.trim();
  if (!name) return { error: "Name is required" };

  // Place new entries at the end of their kind.
  const { data: last } = await supabase
    .from("event_calendars")
    .select("sort_order")
    .eq("school_id", schoolId)
    .eq("kind", data.kind)
    .order("sort_order", { ascending: false })
    .limit(1);
  const nextOrder = last && last.length ? last[0].sort_order + 1 : 0;

  const { data: created, error } = await supabase
    .from("event_calendars")
    .insert({
      school_id: schoolId,
      kind: data.kind,
      name,
      color: data.color,
      sort_order: nextOrder,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505")
      return { error: `A ${data.kind} named "${name}" already exists` };
    return { error: error.message };
  }

  logAudit(
    user.id,
    "create_event_calendar",
    "event_calendar",
    created.id,
    { kind: data.kind, name },
    schoolId
  );
  revalidatePath("/", "layout");
  return { calendar: created as EventCalendar };
}

export async function updateEventCalendar(
  id: string,
  schoolId: string,
  data: { name?: string; color?: string }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const payload: Record<string, string> = {};
  if (data.name !== undefined) {
    const name = data.name.trim();
    if (!name) return { error: "Name is required" };
    payload.name = name;
  }
  if (data.color !== undefined) payload.color = data.color;

  const { error } = await supabase
    .from("event_calendars")
    .update(payload)
    .eq("id", id)
    .eq("school_id", schoolId);

  if (error) {
    if (error.code === "23505")
      return { error: "A calendar with that name already exists" };
    return { error: error.message };
  }

  if (user)
    logAudit(user.id, "update_event_calendar", "event_calendar", id, payload, schoolId);
  revalidatePath("/", "layout");
  return { success: true };
}

export async function deleteEventCalendar(id: string, schoolId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // event_calendar_links rows cascade-delete via FK;
  // the events themselves are untouched.
  const { error } = await supabase
    .from("event_calendars")
    .delete()
    .eq("id", id)
    .eq("school_id", schoolId);

  if (error) return { error: error.message };

  if (user)
    logAudit(user.id, "delete_event_calendar", "event_calendar", id, undefined, schoolId);
  revalidatePath("/", "layout");
  return { success: true };
}
