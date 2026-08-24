import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import type { EventType } from "@/lib/types";
import type { NormalizedEvent } from "./ical";

// Decides which of a school's own divisions/categories a synced Blackbaud
// event belongs to.
//
// Deterministic mappings run first and the model only sees what they miss.
// That ordering matters: a feed named "Upper School Athletics" already states
// the answer, and every event we can tag from a mapping is one we don't pay
// for, wait on, or have to second-guess. Admin corrections in the review queue
// write new mappings, so the model's share shrinks over a season.

export interface CalendarRow {
  id: string;
  kind: "division" | "category";
  name: string;
}

/** A stored source-value -> calendar rule. */
export interface MappingRow {
  source_kind: "feed" | "ical_category" | "sky_category" | "sky_level";
  source_value: string;
  calendar_id: string;
}

export interface TagResult {
  calendarIds: string[];
  eventType: EventType;
  source: "none" | "mapping" | "ai";
  confidence: number | null;
}

export function normalizeSourceValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Deterministic pass ───────────────────────────────

/**
 * Match a signal against calendar names directly, for schools that haven't
 * built mappings yet. Exact match first; then whole-word containment, so the
 * category "Upper School Athletics" resolves to both the "Upper School"
 * division and the "Athletics" category.
 */
function matchByName(signal: string, calendars: CalendarRow[]): string[] {
  const normalized = normalizeSourceValue(signal);
  if (!normalized) return [];

  const exact = calendars.filter(
    (calendar) => normalizeSourceValue(calendar.name) === normalized
  );
  if (exact.length > 0) return exact.map((calendar) => calendar.id);

  return calendars
    .filter((calendar) => {
      const name = normalizeSourceValue(calendar.name);
      if (!name) return false;
      return new RegExp(`\\b${escapeRegExp(name)}\\b`).test(normalized);
    })
    .map((calendar) => calendar.id);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const TYPE_KEYWORDS: Array<{ type: EventType; pattern: RegExp }> = [
  { type: "sports", pattern: /\b(game|match|meet|scrimmage|tournament|practice|athletic|vs\.?|varsity|jv)\b/i },
  { type: "arts", pattern: /\b(concert|recital|play|musical|art show|gallery|drama|band|choir|orchestra)\b/i },
  { type: "holiday", pattern: /\b(break|holiday|no school|closed|closure|vacation|recess)\b/i },
  { type: "meeting", pattern: /\b(meeting|conference|pta|pto|board|assembly|orientation|open house)\b/i },
  { type: "academic", pattern: /\b(exam|final|midterm|test|quiz|report card|grades due|class|lecture|semester|term)\b/i },
];

/** Infer an event_type from the title/categories. Cheap and usually right. */
export function inferEventType(event: NormalizedEvent): EventType {
  const haystack = [event.title, ...event.categories].join(" ");

  for (const { type, pattern } of TYPE_KEYWORDS) {
    if (pattern.test(haystack)) return type;
  }

  return "general";
}

/**
 * Tag one event from mappings alone. Returns null when nothing matched, which
 * is the signal to fall through to the model.
 */
export function tagFromMappings(
  event: NormalizedEvent,
  feedId: string,
  calendars: CalendarRow[],
  mappings: MappingRow[]
): TagResult | null {
  const byKey = new Map<string, string[]>();

  for (const mapping of mappings) {
    const key = `${mapping.source_kind}:${mapping.source_value}`;
    byKey.set(key, [...(byKey.get(key) ?? []), mapping.calendar_id]);
  }

  const known = new Set(calendars.map((calendar) => calendar.id));
  const matched = new Set<string>();

  // The feed the event arrived on. Configured once per feed, so it is the
  // most reliable signal available.
  for (const id of byKey.get(`feed:${feedId}`) ?? []) {
    if (known.has(id)) matched.add(id);
  }

  for (const category of event.categories) {
    const normalized = normalizeSourceValue(category);

    for (const id of byKey.get(`ical_category:${normalized}`) ?? []) {
      if (known.has(id)) matched.add(id);
    }
    for (const id of byKey.get(`sky_category:${normalized}`) ?? []) {
      if (known.has(id)) matched.add(id);
    }
    for (const id of byKey.get(`sky_level:${normalized}`) ?? []) {
      if (known.has(id)) matched.add(id);
    }

    // No stored rule — try the school's calendar names directly.
    for (const id of matchByName(category, calendars)) {
      matched.add(id);
    }
  }

  // The title often carries the division outright ("Upper School Open House").
  for (const id of matchByName(event.title, calendars)) {
    matched.add(id);
  }

  if (matched.size === 0) return null;

  return {
    calendarIds: [...matched],
    eventType: inferEventType(event),
    source: "mapping",
    confidence: 1,
  };
}

// ── Model fallback ───────────────────────────────────

const EVENT_TYPES = [
  "general",
  "academic",
  "sports",
  "arts",
  "meeting",
  "holiday",
  "other",
] as const;

const TagSchema = z.object({
  tags: z.array(
    z.object({
      index: z.number().int().describe("The event's index from the input list"),
      division: z
        .string()
        .nullable()
        .describe("Exact division name from the list, or null for whole-school"),
      category: z
        .string()
        .nullable()
        .describe("Exact category name from the list, or null if none fit"),
      eventType: z.enum(EVENT_TYPES),
      confidence: z
        .number()
        .min(0)
        .max(1)
        .describe("How sure you are, 0-1. Below 0.5 means guessing."),
    })
  ),
});

// One request per chunk keeps the prompt inside a sensible size while still
// amortizing the call across many events.
const AI_BATCH_SIZE = 40;

/**
 * Tag the leftovers with Gemini, in batches.
 *
 * Failures return an empty map rather than throwing: an untagged event still
 * reaches the review queue where an admin can tag it, whereas a thrown error
 * would lose the whole night's sync over a model hiccup.
 */
export async function tagWithModel(
  events: NormalizedEvent[],
  calendars: CalendarRow[]
): Promise<Map<number, TagResult>> {
  const results = new Map<number, TagResult>();
  if (events.length === 0) return results;

  const divisions = calendars.filter((c) => c.kind === "division");
  const categories = calendars.filter((c) => c.kind === "category");
  const byName = new Map(
    calendars.map((c) => [`${c.kind}:${normalizeSourceValue(c.name)}`, c.id])
  );

  for (let offset = 0; offset < events.length; offset += AI_BATCH_SIZE) {
    const batch = events.slice(offset, offset + AI_BATCH_SIZE);

    const listing = batch
      .map((event, i) => {
        const parts = [`${offset + i}. "${event.title}"`];
        if (event.location) parts.push(`at ${event.location}`);
        if (event.categories.length) {
          parts.push(`[feed categories: ${event.categories.join(", ")}]`);
        }
        parts.push(event.allDay ? "(all day)" : `(${event.localStartTime})`);
        return parts.join(" ");
      })
      .join("\n");

    try {
      const { object } = await generateObject({
        model: google("gemini-2.5-flash"),
        schema: TagSchema,
        system: `You tag a school's calendar events with the school's own division and category labels.

Divisions: ${divisions.map((d) => `"${d.name}"`).join(", ") || "(none defined)"}
Categories: ${categories.map((c) => `"${c.name}"`).join(", ") || "(none defined)"}

Rules:
- Use a name EXACTLY as written above, or null. Never invent a label.
- division null means the event is for the whole school. Prefer null over a guess.
- Set confidence below 0.5 when you are unsure; an admin reviews low-confidence tags.`,
        prompt: `Tag each event. Return one entry per event, keeping the given index.\n\n${listing}`,
      });

      for (const tag of object.tags) {
        const event = events[tag.index];
        if (!event) continue;

        const calendarIds: string[] = [];
        const divisionId = tag.division
          ? byName.get(`division:${normalizeSourceValue(tag.division)}`)
          : undefined;
        const categoryId = tag.category
          ? byName.get(`category:${normalizeSourceValue(tag.category)}`)
          : undefined;

        if (divisionId) calendarIds.push(divisionId);
        if (categoryId) calendarIds.push(categoryId);

        results.set(tag.index, {
          calendarIds,
          eventType: tag.eventType,
          source: "ai",
          confidence: tag.confidence,
        });
      }
    } catch {
      // Leave this batch untagged; the review queue is the safety net.
      continue;
    }
  }

  return results;
}

/**
 * Tag a whole feed's worth of events: mappings first, model for the remainder.
 */
export async function tagEvents(
  events: NormalizedEvent[],
  feedId: string,
  calendars: CalendarRow[],
  mappings: MappingRow[]
): Promise<TagResult[]> {
  const results: Array<TagResult | null> = events.map((event) =>
    tagFromMappings(event, feedId, calendars, mappings)
  );

  const unresolved = results
    .map((result, index) => ({ result, index }))
    .filter((entry) => entry.result === null);

  if (unresolved.length > 0 && calendars.length > 0) {
    const modelTags = await tagWithModel(
      unresolved.map((entry) => events[entry.index]),
      calendars
    );

    // tagWithModel indexes against the array it was given, not the original.
    unresolved.forEach((entry, position) => {
      const tag = modelTags.get(position);
      if (tag) results[entry.index] = tag;
    });
  }

  return results.map((result, index) => {
    if (result) return result;
    return {
      calendarIds: [],
      eventType: inferEventType(events[index]),
      source: "none" as const,
      confidence: null,
    };
  });
}
