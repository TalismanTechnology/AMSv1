import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { TEXT_MODEL_ID } from "@/lib/ai/models";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { redactChildNames, type NamedChild } from "@/lib/ai/child-privacy";
import { FALLBACK_TOPIC, matchExistingTopic, sanitizeTopic } from "./aggregate";
import { chunk, daysAgoISO, fetchAllPages } from "./queries";
import { reportAiFailure } from "@/lib/alerts/ai-failure-alert";

/**
 * Give each recent parent question a short, generic topic label ("Lunch
 * Menu") and cache it in question_topics, so admin Analytics can show
 * aggregate topics without ever showing the questions.
 *
 * Cheap by design: only unlabeled questions from the last 90 days, ~60 per
 * Gemini call, capped per run. Children's names are redacted before anything
 * leaves for the provider (lib/ai/child-privacy.ts). Never throws — callers
 * are a cron and a page render's after() — it logs and returns the count.
 */

const LOOKBACK_DAYS = 90;
const BATCH_SIZE = 60;
const DEFAULT_LIMIT = 300;
const QUESTION_MAX_CHARS = 300;
const MAX_EXISTING_LABELS = 80;

interface QuestionEventRow {
  id: string;
  user_id: string | null;
  question: string | null;
}

interface LabeledRow {
  event_id: string;
  topic: string;
}

interface PendingQuestion {
  eventId: string;
  text: string;
}

const responseSchema = z.object({
  labels: z.array(
    z.object({
      n: z.number().describe("The question number from the list"),
      topic: z.string().describe("1-4 word Title Case topic"),
    })
  ),
});

/**
 * `createdBefore` (the purge cron, ahead of scrubbing): only events older than
 * this that still hold their text, oldest first — the ones about to lose it.
 */
export async function labelPendingQuestions(
  schoolId: string,
  { limit = DEFAULT_LIMIT, createdBefore }: { limit?: number; createdBefore?: string } = {}
): Promise<number> {
  let labeled = 0;
  try {
    const supabase = createAdminClient();
    const since = daysAgoISO(LOOKBACK_DAYS);

    const [events, existing] = await Promise.all([
      fetchAllPages<QuestionEventRow>((from, to) => {
        let q = supabase
          .from("analytics_events")
          .select("id, user_id, question:metadata->>question")
          .eq("school_id", schoolId)
          .eq("event_type", "question")
          .gte("created_at", since);
        if (createdBefore) {
          q = q.lt("created_at", createdBefore).is("metadata->>scrubbed", null);
        }
        return q
          .order("created_at", { ascending: !!createdBefore })
          .order("id")
          .range(from, to);
      }),
      fetchAllPages<LabeledRow>((from, to) =>
        supabase
          .from("question_topics")
          .select("event_id, topic, analytics_events!inner(created_at)")
          .eq("school_id", schoolId)
          .gte("analytics_events.created_at", since)
          .order("event_id")
          .range(from, to)
      ),
    ]);

    const done = new Set(existing.map((r) => r.event_id));
    const pending = events.filter((e) => !done.has(e.id)).slice(0, Math.max(0, limit));
    if (pending.length === 0) return 0;

    // Most-used labels first so the model converges on a stable vocabulary.
    const labelCounts = new Map<string, number>();
    for (const r of existing) labelCounts.set(r.topic, (labelCounts.get(r.topic) ?? 0) + 1);
    const knownLabels = [...labelCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label]) => label)
      .slice(0, MAX_EXISTING_LABELS);

    const childrenByParent = await loadChildren(
      supabase,
      schoolId,
      [...new Set(pending.map((e) => e.user_id).filter((id): id is string => !!id))]
    );

    // Empty questions need no model call.
    const toLabel: PendingQuestion[] = [];
    const blank: string[] = [];
    for (const e of pending) {
      const raw = (e.question ?? "").trim();
      if (!raw) {
        blank.push(e.id);
        continue;
      }
      const redacted = redactChildNames(raw, childrenByParent.get(e.user_id ?? "") ?? []);
      toLabel.push({
        eventId: e.id,
        text: redacted.replace(/\s+/g, " ").slice(0, QUESTION_MAX_CHARS),
      });
    }

    if (blank.length > 0) {
      labeled += await saveTopics(
        supabase,
        schoolId,
        blank.map((eventId) => ({ eventId, topic: FALLBACK_TOPIC }))
      );
    }

    for (const batch of chunk(toLabel, BATCH_SIZE)) {
      try {
        const topics = await labelBatch(batch, knownLabels);
        for (const t of topics) {
          if (!knownLabels.includes(t.topic)) knownLabels.push(t.topic);
        }
        labeled += await saveTopics(supabase, schoolId, topics);
      } catch (err) {
        // Leave this batch unlabeled; the next run retries it.
        reportAiFailure(err, { source: "insights.topic-labeling", schoolId });
      }
    }
  } catch (err) {
    console.error(`[insights] labelPendingQuestions failed for school ${schoolId}:`, err);
  }
  return labeled;
}

async function labelBatch(
  batch: PendingQuestion[],
  knownLabels: string[]
): Promise<{ eventId: string; topic: string }[]> {
  const list = batch.map((q, i) => `${i + 1}. ${JSON.stringify(q.text)}`).join("\n");
  const existingBlock =
    knownLabels.length > 0
      ? `Existing topic labels (reuse one of these, spelled exactly, whenever it fits):\n${knownLabels
          .map((l) => `- ${l}`)
          .join("\n")}`
      : "There are no existing topic labels yet.";

  const { object } = await generateObject({
    model: google(TEXT_MODEL_ID),
    schema: responseSchema,
    system: `You assign a short topic to each question parents asked a school's assistant.

Rules:
- Each topic is 1-4 words in Title Case, e.g. "Lunch Menu", "Dress Code", "Sports Schedule", "School Calendar", "Tuition & Fees".
- Use a generic category only. NEVER include names of people, children, teachers, or any personal detail (grades of a specific child, health, addresses, dates, phone numbers).
- Reuse an existing label whenever it fits; only create a new label when none fits.
- Questions about the same thing get the same label.
- Return exactly one entry per question, using its number.`,
    prompt: `${existingBlock}

Questions:
${list}`,
    temperature: 0,
    // As in lib/ai/label-clusters.ts: Gemini thinking tokens otherwise eat
    // the output budget and truncate the list.
    providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
  });

  const byNumber = new Map<number, string>();
  for (const { n, topic } of object.labels) {
    if (Number.isInteger(n) && n >= 1 && n <= batch.length && !byNumber.has(n)) {
      byNumber.set(n, topic);
    }
  }
  // A question the model skipped gets "Other" rather than being retried
  // forever; the response as a whole was usable.
  return batch.map((q, i) => ({
    eventId: q.eventId,
    topic: matchExistingTopic(sanitizeTopic(byNumber.get(i + 1)), knownLabels),
  }));
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function saveTopics(
  supabase: AdminClient,
  schoolId: string,
  topics: { eventId: string; topic: string }[]
): Promise<number> {
  if (topics.length === 0) return 0;
  // ignoreDuplicates: a concurrent run (cron + page load) may have labeled
  // the same event already; first label wins.
  const { error } = await supabase.from("question_topics").upsert(
    topics.map((t) => ({ event_id: t.eventId, school_id: schoolId, topic: t.topic })),
    { onConflict: "event_id", ignoreDuplicates: true }
  );
  if (error) {
    console.error(`[insights] failed to save topics for school ${schoolId}:`, error.message);
    return 0;
  }
  return topics.length;
}

async function loadChildren(
  supabase: AdminClient,
  schoolId: string,
  parentIds: string[]
): Promise<Map<string, NamedChild[]>> {
  const byParent = new Map<string, NamedChild[]>();
  for (const ids of chunk(parentIds)) {
    const { data, error } = await supabase
      .from("children")
      .select("parent_id, name, grade")
      .eq("school_id", schoolId)
      .in("parent_id", ids);
    // Without the names we can't redact them, so don't send these questions.
    if (error) throw new Error(`Failed to load children: ${error.message}`);
    for (const row of (data ?? []) as { parent_id: string; name: string; grade: string }[]) {
      const list = byParent.get(row.parent_id) ?? [];
      list.push({ name: row.name, grade: row.grade });
      byParent.set(row.parent_id, list);
    }
  }
  return byParent;
}
