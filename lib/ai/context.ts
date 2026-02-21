import { createAdminClient } from "@/lib/supabase/admin";

export interface EventContext {
  id: string;
  title: string;
  description: string | null;
  date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  event_type: string;
}

export interface AnnouncementContext {
  id: string;
  title: string;
  content: string;
  priority: string;
  pinned: boolean;
  created_at: string;
}

/**
 * Fetch upcoming and recent events (7 days past to 60 days future, max 30).
 */
export async function fetchEventsForContext(
  schoolId: string
): Promise<EventContext[]> {
  const supabase = createAdminClient();

  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 7);
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 60);

  const { data, error } = await supabase
    .from("events")
    .select(
      "id, title, description, date, start_time, end_time, location, event_type"
    )
    .eq("school_id", schoolId)
    .gte("date", pastDate.toISOString().split("T")[0])
    .lte("date", futureDate.toISOString().split("T")[0])
    .order("date", { ascending: true })
    .limit(30);

  if (error) {
    console.error("Failed to fetch events for AI context:", error);
    return [];
  }

  return data || [];
}

/**
 * Fetch active published, non-expired announcements (max 20).
 */
export async function fetchAnnouncementsForContext(
  schoolId: string
): Promise<AnnouncementContext[]> {
  const supabase = createAdminClient();

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("announcements")
    .select("id, title, content, priority, pinned, created_at")
    .eq("school_id", schoolId)
    .eq("status", "published")
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("Failed to fetch announcements for AI context:", error);
    return [];
  }

  return data || [];
}

/**
 * Format events as a concise text block for the system prompt.
 */
export function formatEventsContext(events: EventContext[]): string {
  if (events.length === 0) return "";

  const lines = events.map((e) => {
    const parts = [`- "${e.title}" on ${e.date}`];
    if (e.start_time) {
      parts.push(`from ${e.start_time}`);
      if (e.end_time) parts.push(`to ${e.end_time}`);
    }
    if (e.location) parts.push(`at ${e.location}`);
    parts.push(`(${e.event_type})`);
    if (e.description) parts.push(`— ${e.description}`);
    return parts.join(" ");
  });

  return `SCHOOL EVENTS (upcoming and recent):\n${lines.join("\n")}`;
}

/**
 * Format announcements as a concise text block for the system prompt.
 */
export function formatAnnouncementsContext(
  announcements: AnnouncementContext[]
): string {
  if (announcements.length === 0) return "";

  const lines = announcements.map((a) => {
    const tags: string[] = [];
    if (a.pinned) tags.push("PINNED");
    if (a.priority !== "normal") tags.push(a.priority.toUpperCase());
    const prefix = tags.length > 0 ? `[${tags.join(", ")}] ` : "";
    const content =
      a.content.length > 500 ? a.content.slice(0, 500) + "..." : a.content;
    return `- ${prefix}"${a.title}": ${content}`;
  });

  return `SCHOOL ANNOUNCEMENTS (active):\n${lines.join("\n")}`;
}

export interface ChildContext {
  name: string;
  grade: string;
}

/**
 * Fetch parent's children (name + grade) for context.
 */
export async function fetchChildrenForContext(
  userId: string,
  schoolId: string
): Promise<ChildContext[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("children")
    .select("name, grade")
    .eq("parent_id", userId)
    .eq("school_id", schoolId);

  if (error) {
    console.error("Failed to fetch children for AI context:", error);
    return [];
  }

  return data || [];
}

/**
 * Format children as a text block for the system prompt.
 */
export function formatChildrenContext(children: ChildContext[]): string {
  if (children.length === 0) return "";

  const lines = children.map((c) => `- ${c.name} (${c.grade})`);
  return `PARENT'S CHILDREN:\n${lines.join("\n")}`;
}

/**
 * Formatted current date for temporal reasoning in the prompt.
 */
export function getTodayString(): string {
  const now = new Date();
  return `Today's date is ${now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })}.`;
}
