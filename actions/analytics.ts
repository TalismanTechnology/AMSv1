"use server";

import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSchoolAdmin } from "@/lib/auth/require-school-admin";
import { labelPendingQuestions } from "@/lib/insights/topics";
import { computeHeadlineMetrics, type HeadlineMetrics } from "@/lib/metrics/definitions";
import {
  countActiveChats,
  loadDocumentMetrics,
  loadMetricInputs,
  type DocumentMetrics,
} from "@/lib/metrics/load";
import { loadTopicsSection, type TopicsSection } from "@/lib/metrics/topics";
import { parseMetricRange, type MetricRange } from "@/lib/metrics/windows";

// Everything on admin Analytics (the old Analytics + Insights pages), from
// the shared definitions in lib/metrics (docs/metrics.md). analytics_events
// and chat rows are not readable by school admins through RLS (they contain
// parents' question text), so authorize for THIS school, then read with the
// service role and return aggregates — plus flagged questions, which staff
// may see (lib/metrics/topics.ts).

export interface AnalyticsData {
  metrics: HeadlineMetrics;
  documents: DocumentMetrics;
  /** Chats with activity in the range. */
  activeChats: number;
  topics: Omit<TopicsSection, "hasUnlabeled">;
}

// Labels a new school's backlog on page load; the daily cron does the rest.
const ON_LOAD_LABEL_LIMIT = 150;
const ON_LOAD_LABEL_COOLDOWN_MS = 5 * 60 * 1000;
// Best-effort per-instance throttle so repeated page loads (or range
// switches) don't each start a labeling run.
const lastLabelKickoff = new Map<string, number>();

export async function getAnalyticsData(schoolId: string, range: MetricRange): Promise<AnalyticsData> {
  const auth = await requireSchoolAdmin(schoolId);
  if ("error" in auth) throw new Error(auth.error);
  const supabase = createAdminClient();
  const scope = { schoolId, range: parseMetricRange(range), now: new Date() };

  const inputs = await loadMetricInputs(supabase, scope);
  const [documents, activeChats, { hasUnlabeled, ...topics }] = await Promise.all([
    loadDocumentMetrics(supabase, schoolId),
    countActiveChats(supabase, scope),
    loadTopicsSection(supabase, schoolId, inputs),
  ]);
  if (hasUnlabeled) scheduleTopicLabeling(schoolId);

  return { metrics: computeHeadlineMetrics(inputs), documents, activeChats, topics };
}

/** Per-day CSV for the range: the same series the charts show. */
export async function exportAnalyticsCSV(schoolId: string, range: MetricRange): Promise<string> {
  const auth = await requireSchoolAdmin(schoolId);
  if ("error" in auth) throw new Error(auth.error);
  const metrics = computeHeadlineMetrics(
    await loadMetricInputs(createAdminClient(), { schoolId, range: parseMetricRange(range) })
  );

  const rows = [
    ["Date (ET)", "Questions", "Total parents"],
    ...metrics.questionsByDay.map((d, i) => [
      d.date,
      String(d.count),
      String(metrics.parentGrowth[i]?.total ?? ""),
    ]),
  ];
  return rows.map((r) => r.join(",")).join("\n");
}

/** Kick off background labeling after the response; never blocks or throws. */
function scheduleTopicLabeling(schoolId: string) {
  const now = Date.now();
  const last = lastLabelKickoff.get(schoolId) ?? 0;
  if (now - last < ON_LOAD_LABEL_COOLDOWN_MS) return;
  lastLabelKickoff.set(schoolId, now);
  try {
    after(async () => {
      await labelPendingQuestions(schoolId, { limit: ON_LOAD_LABEL_LIMIT });
    });
  } catch (err) {
    console.error("[analytics] could not schedule topic labeling:", err);
  }
}
