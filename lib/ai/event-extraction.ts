import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import type { EventType } from "@/lib/types";

// ── Types ────────────────────────────────────────────

/** One event the AI pulled out of a document, pre-insert. */
export interface ExtractedEvent {
  title: string;
  /** Start date, ISO YYYY-MM-DD. */
  date: string;
  /** End date for multi-day spans (e.g. a break), else null. */
  endDate: string | null;
  allDay: boolean;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  eventType: EventType;
  description: string | null;
  /** Division tag name the AI matched, or null for whole-school. */
  suggestedDivision: string | null;
  /** Category tag name the AI matched, or null. */
  suggestedCategory: string | null;
}

export interface CalendarOption {
  kind: "division" | "category";
  name: string;
}

// ── Schema ───────────────────────────────────────────

const EVENT_TYPES = [
  "general",
  "academic",
  "sports",
  "arts",
  "meeting",
  "holiday",
  "other",
] as const;

const ExtractionSchema = z.object({
  events: z.array(
    z.object({
      title: z.string().describe("Concise event name, e.g. 'Thanksgiving Break'"),
      date: z
        .string()
        .describe("Start date in YYYY-MM-DD format, year resolved from context"),
      endDate: z
        .string()
        .nullable()
        .describe(
          "End date YYYY-MM-DD for multi-day spans (e.g. a break Nov 25–27), else null"
        ),
      allDay: z
        .boolean()
        .describe("True when no specific start/end time is given (breaks, holidays)"),
      startTime: z
        .string()
        .nullable()
        .describe("Start time HH:mm (24h) if stated, else null"),
      endTime: z.string().nullable().describe("End time HH:mm (24h) if stated, else null"),
      location: z.string().nullable().describe("Location if stated, else null"),
      eventType: z.enum(EVENT_TYPES).describe("Best-fit type; use 'holiday' for closures"),
      description: z
        .string()
        .nullable()
        .describe("Short extra detail from the source, or null"),
      suggestedDivision: z
        .string()
        .nullable()
        .describe(
          "Exact name of a division tag this event targets, or null if it applies to the whole school"
        ),
      suggestedCategory: z
        .string()
        .nullable()
        .describe("Exact name of a category tag this event fits, or null"),
    })
  ),
});

// ── Core function ────────────────────────────────────

/**
 * Extract calendar events from raw document text with Gemini.
 *
 * The available division/category tag names are passed in so the model's
 * suggestions map onto real `event_calendars` rows.
 */
export async function extractCalendarEvents(
  text: string,
  options: { calendars: CalendarOption[] }
): Promise<ExtractedEvent[]> {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const divisions = options.calendars
    .filter((c) => c.kind === "division")
    .map((c) => c.name);
  const categories = options.calendars
    .filter((c) => c.kind === "category")
    .map((c) => c.name);

  const tagBlock = [
    divisions.length
      ? `Divisions: ${divisions.map((n) => `"${n}"`).join(", ")}`
      : "Divisions: (none defined)",
    categories.length
      ? `Categories: ${categories.map((n) => `"${n}"`).join(", ")}`
      : "Categories: (none defined)",
  ].join("\n");

  const { object } = await generateObject({
    model: google("gemini-2.5-flash"),
    schema: ExtractionSchema,
    system: `You extract calendar events from a school document (calendars, schedules, newsletters).

Rules:
- Extract EVERY dated entry. Do not invent events that are not in the text.
- Resolve each year from context — documents often have year column headers (e.g. a "2026" column and a "2027" column). Every date MUST include the correct year.
- Output dates strictly as YYYY-MM-DD. If a day-of-week is given, trust the explicit date.
- For a multi-day span ("Nov 25–27", "Winter Break Dec 21–Jan 1"), set "date" to the first day and "endDate" to the last day. Single-day events set "endDate" to null.
- Mark closures, breaks, and holidays as eventType "holiday" with allDay true.
- Only set allDay false and fill startTime/endTime when the source gives an explicit time.
- suggestedDivision: set ONLY when an entry clearly targets one division (e.g. "Middle School Moving Up Day" → the Middle School division). Otherwise null (applies to the whole school). Use the EXACT tag name from the list, or null if none matches.
- suggestedCategory: same rule — exact name from the list, or null.
- Keep titles concise; put any extra detail in "description".`,
    prompt: `Available calendar tags for this school (use exact names or null):
${tagBlock}

--- DOCUMENT TEXT ---
${trimmed}
--- END ---

Extract all events.`,
    temperature: 0.1,
    maxRetries: 3,
  });

  return object.events;
}
