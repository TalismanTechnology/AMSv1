// Pure helpers behind the "Topics & questions" section of admin Analytics
// (lib/metrics/topics.ts) and the topic labeler (lib/insights/topics.ts). No
// I/O here so it can be unit tested. Counts (questions, active parents,
// answer rate) live in lib/metrics/definitions.ts.
//
// Privacy (app/privacy/page.tsx §6, migration 031): school staff may read a
// parent's words only for FLAGGED exchanges (unanswered / thumbs-down).
// Everything else on the page is aggregate, and topics are k-anonymous.

// A topic is shown only once at least this many questions, from at least this
// many DIFFERENT parents, fall under it.
export const MIN_TOPIC_QUESTIONS = 3;
export const MIN_DISTINCT_ASKERS = 3;

export const TOPIC_MAX_CHARS = 40;
export const FALLBACK_TOPIC = "Other";

// --------------------------------------------
// Topic labels
// --------------------------------------------

const EDGE_JUNK = /^[\s"'`“”‘’.,;:!?\-–—*_#()[\]{}<>]+|[\s"'`“”‘’.,;:!?\-–—*_#()[\]{}<>]+$/g;

/**
 * Clean a model-produced topic label: trim, strip quotes/punctuation at the
 * ends, collapse whitespace, cap the length (at a word boundary when
 * possible). Anything unusable becomes "Other".
 */
export function sanitizeTopic(raw: unknown): string {
  if (typeof raw !== "string") return FALLBACK_TOPIC;
  let topic = raw.replace(/\s+/g, " ").replace(EDGE_JUNK, "");
  if (topic.length > TOPIC_MAX_CHARS) {
    const cut = topic.slice(0, TOPIC_MAX_CHARS + 1);
    const lastSpace = cut.lastIndexOf(" ");
    topic = (lastSpace > 0 ? cut.slice(0, lastSpace) : cut.slice(0, TOPIC_MAX_CHARS)).replace(
      EDGE_JUNK,
      ""
    );
  }
  return /[\p{L}\p{N}]/u.test(topic) ? topic : FALLBACK_TOPIC;
}

/**
 * Reuse an existing label when the model returns the same words in a
 * different case ("lunch menu" → "Lunch Menu"), so counts aren't split.
 */
export function matchExistingTopic(topic: string, existing: Iterable<string>): string {
  const key = topic.toLowerCase();
  for (const label of existing) {
    if (label.toLowerCase() === key) return label;
  }
  return topic;
}

export interface TopicRow {
  topic: string;
  /** Who asked — used server-side only for the distinct-asker threshold. */
  askerId: string | null;
}

export interface TopicSummary {
  topics: { label: string; count: number }[];
  /** Topics withheld because they fell under the k-anonymity thresholds. */
  hiddenTopicCount: number;
}

/**
 * Count questions per topic and drop any topic with fewer than
 * MIN_TOPIC_QUESTIONS questions or MIN_DISTINCT_ASKERS distinct askers.
 * Only labels and counts come out — never askers or questions.
 */
export function summarizeTopics(
  rows: TopicRow[],
  {
    minQuestions = MIN_TOPIC_QUESTIONS,
    minAskers = MIN_DISTINCT_ASKERS,
    limit = 20,
  }: { minQuestions?: number; minAskers?: number; limit?: number } = {}
): TopicSummary {
  const counts = new Map<string, number>();
  const askers = new Map<string, Set<string>>();
  for (const { topic, askerId } of rows) {
    counts.set(topic, (counts.get(topic) ?? 0) + 1);
    // An event with no user counts as nobody: it can't help a topic pass.
    if (askerId) {
      let set = askers.get(topic);
      if (!set) askers.set(topic, (set = new Set()));
      set.add(askerId);
    }
  }

  const visible: { label: string; count: number }[] = [];
  let hiddenTopicCount = 0;
  for (const [label, count] of counts) {
    if (count >= minQuestions && (askers.get(label)?.size ?? 0) >= minAskers) {
      visible.push({ label, count });
    } else {
      hiddenTopicCount++;
    }
  }
  visible.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return { topics: visible.slice(0, limit), hiddenTopicCount };
}

// --------------------------------------------
// Flagged ("couldn't answer") questions
// --------------------------------------------

export type FlagReason = "unanswered" | "unhelpful";

/** lowercase, trim, collapse whitespace, strip trailing punctuation. */
export function normalizeQuestion(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\s.,;:!?…"'”’)]+$/u, "");
}

export interface FlaggedQuestion {
  text: string;
  createdAt: string;
  reason: FlagReason;
  clusterId?: string | null;
  clusterLabel?: string | null;
  /**
   * Same value for two items that are really one exchange (e.g. an
   * unanswered question the parent also thumbs-downed): counted once, with
   * both reasons. Server-side only; never returned.
   */
  dedupeKey?: string | null;
}

export interface FlaggedGroup {
  key: string;
  text: string;
  count: number;
  lastAskedAt: string;
  reasons: FlagReason[];
}

const REASON_ORDER: FlagReason[] = ["unanswered", "unhelpful"];

/**
 * Group flagged questions by similarity: the unanswered cluster when there is
 * one, otherwise normalized text. A question with no cluster joins a cluster
 * that already contains the same normalized text. Sorted by count, then most
 * recent; capped at `limit` groups.
 */
export function groupFlaggedQuestions(
  items: FlaggedQuestion[],
  limit = 25
): FlaggedGroup[] {
  // Collapse duplicates of the same exchange first.
  const deduped: (FlaggedQuestion & { reasons: Set<FlagReason> })[] = [];
  const byDedupe = new Map<string, (typeof deduped)[number]>();
  for (const item of items) {
    const existing = item.dedupeKey ? byDedupe.get(item.dedupeKey) : undefined;
    if (existing) {
      existing.reasons.add(item.reason);
      if (!existing.clusterId && item.clusterId) {
        existing.clusterId = item.clusterId;
        existing.clusterLabel = item.clusterLabel;
      }
      if (item.createdAt > existing.createdAt) existing.createdAt = item.createdAt;
      continue;
    }
    const entry = { ...item, reasons: new Set<FlagReason>([item.reason]) };
    deduped.push(entry);
    if (item.dedupeKey) byDedupe.set(item.dedupeKey, entry);
  }

  // normalized text → cluster, so unclustered repeats join their cluster.
  const clusterForText = new Map<string, string>();
  for (const item of deduped) {
    if (item.clusterId) {
      const norm = normalizeQuestion(item.text);
      if (norm && !clusterForText.has(norm)) clusterForText.set(norm, item.clusterId);
    }
  }

  interface Acc {
    key: string;
    count: number;
    lastAskedAt: string;
    latestText: string;
    clusterLabel: string | null;
    reasons: Set<FlagReason>;
  }
  const groups = new Map<string, Acc>();
  for (const item of deduped) {
    const norm = normalizeQuestion(item.text);
    const clusterId = item.clusterId || clusterForText.get(norm);
    if (!clusterId && !norm) continue;
    const key = clusterId ? `cluster:${clusterId}` : `q:${norm}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        count: 0,
        lastAskedAt: item.createdAt,
        latestText: item.text,
        clusterLabel: null,
        reasons: new Set(),
      };
      groups.set(key, g);
    }
    g.count++;
    if (item.createdAt >= g.lastAskedAt) {
      g.lastAskedAt = item.createdAt;
      g.latestText = item.text;
    }
    const label = item.clusterLabel?.trim();
    if (label && !g.clusterLabel) g.clusterLabel = label;
    for (const r of item.reasons) g.reasons.add(r);
  }

  return [...groups.values()]
    .sort(
      (a, b) =>
        b.count - a.count ||
        b.lastAskedAt.localeCompare(a.lastAskedAt) ||
        a.key.localeCompare(b.key)
    )
    .slice(0, limit)
    .map((g) => ({
      key: g.key,
      text: (g.clusterLabel || g.latestText).replace(/\s+/g, " ").trim(),
      count: g.count,
      lastAskedAt: g.lastAskedAt,
      reasons: REASON_ORDER.filter((r) => g.reasons.has(r)),
    }));
}
