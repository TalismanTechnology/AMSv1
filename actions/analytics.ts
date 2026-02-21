"use server";

import { createClient } from "@/lib/supabase/server";

export type TimeRange = "7d" | "30d" | "90d" | "all";

export interface AnalyticsData {
  dailyData: { date: string; questions: number }[];
  topQuestions: { question: string; count: number }[];
  totalQuestions: number;
  uniqueUsers: number;
  totalDocuments: number;
  activeSessions: number;
  documentTypes: { type: string; count: number }[];
  hourlyDistribution: { hour: number; count: number }[];
  userGrowth: { date: string; users: number }[];
  timeRange: TimeRange;
}

function normalizeFileType(raw: string | null | undefined): string {
  if (!raw) return "Other";
  const lower = raw.toLowerCase();
  if (lower.includes("pdf")) return "PDF";
  if (lower.includes("word") || lower.includes("docx")) return "DOCX";
  if (lower.includes("sheet") || lower.includes("xlsx")) return "XLSX";
  if (lower.includes("csv")) return "CSV";
  if (lower.includes("text")) return "TXT";
  if (lower.includes("pptx") || lower.includes("presentation")) return "PPTX";
  return raw.toUpperCase();
}

function getDaysFromRange(range: TimeRange): number {
  switch (range) {
    case "7d":
      return 7;
    case "30d":
      return 30;
    case "90d":
      return 90;
    case "all":
      return 365;
  }
}

export async function getAnalyticsData(
  timeRange: TimeRange = "30d",
  schoolId?: string
): Promise<AnalyticsData> {
  const supabase = await createClient();

  const now = new Date();
  const days = getDaysFromRange(timeRange);
  const rangeStart = new Date();
  rangeStart.setDate(rangeStart.getDate() - days);
  const rangeStartISO = rangeStart.toISOString();

  // Build queries with optional school_id filtering
  let analyticsEventsQuery = supabase
    .from("analytics_events")
    .select("*")
    .eq("event_type", "question")
    .gte("created_at", rangeStartISO)
    .order("created_at", { ascending: true });
  if (schoolId) analyticsEventsQuery = analyticsEventsQuery.eq("school_id", schoolId);

  let totalDocsQuery = supabase
    .from("documents")
    .select("*", { count: "exact", head: true })
    .eq("status", "ready");
  if (schoolId) totalDocsQuery = totalDocsQuery.eq("school_id", schoolId);

  let activeSessionsQuery = supabase
    .from("chat_sessions")
    .select("*", { count: "exact", head: true })
    .gte("updated_at", rangeStartISO);
  if (schoolId) activeSessionsQuery = activeSessionsQuery.eq("school_id", schoolId);

  let documentRowsQuery = supabase
    .from("documents")
    .select("file_type")
    .eq("status", "ready");
  if (schoolId) documentRowsQuery = documentRowsQuery.eq("school_id", schoolId);

  let chatMessagesQuery = supabase
    .from("chat_messages")
    .select("created_at, chat_sessions!inner(school_id)")
    .eq("role", "user")
    .gte("created_at", rangeStartISO);
  if (schoolId) chatMessagesQuery = chatMessagesQuery.eq("chat_sessions.school_id", schoolId);

  let parentProfilesQuery = supabase
    .from("school_memberships")
    .select("created_at")
    .eq("role", "parent")
    .order("created_at", { ascending: true });
  if (schoolId) parentProfilesQuery = parentProfilesQuery.eq("school_id", schoolId);

  const [
    { data: events },
    { count: totalDocuments },
    { count: activeSessions },
    { data: documentRows },
    { data: chatMessages },
    { data: parentProfiles },
  ] = await Promise.all([
    analyticsEventsQuery,
    totalDocsQuery,
    activeSessionsQuery,
    documentRowsQuery,
    chatMessagesQuery,
    parentProfilesQuery,
  ]);

  // Questions per day
  const questionsPerDay: Record<string, number> = {};
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const key = date.toISOString().split("T")[0];
    questionsPerDay[key] = 0;
  }

  events?.forEach((event) => {
    const key = new Date(event.created_at).toISOString().split("T")[0];
    if (questionsPerDay[key] !== undefined) {
      questionsPerDay[key]++;
    }
  });

  const dailyData = Object.entries(questionsPerDay).map(([date, count]) => ({
    date,
    questions: count,
  }));

  // Top questions
  const questionCounts: Record<string, number> = {};
  events?.forEach((event) => {
    const question = (event.metadata as Record<string, unknown>)
      ?.question as string;
    if (question) {
      const normalized = question.toLowerCase().trim();
      questionCounts[normalized] = (questionCounts[normalized] || 0) + 1;
    }
  });

  const topQuestions = Object.entries(questionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([question, count]) => ({ question, count }));

  // Total stats
  const totalQuestions = events?.length || 0;
  const uniqueUsers = new Set(events?.map((e) => e.user_id)).size;

  // Document types
  const typeCountMap: Record<string, number> = {};
  documentRows?.forEach((row) => {
    const normalized = normalizeFileType(row.file_type);
    typeCountMap[normalized] = (typeCountMap[normalized] || 0) + 1;
  });

  const documentTypes = Object.entries(typeCountMap)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  // Hourly distribution
  const hourlyCounts: number[] = new Array(24).fill(0);
  chatMessages?.forEach((msg) => {
    const hour = new Date(msg.created_at).getHours();
    hourlyCounts[hour]++;
  });

  const hourlyDistribution = hourlyCounts.map((count, hour) => ({
    hour,
    count,
  }));

  // User growth
  const baseline =
    parentProfiles?.filter((p) => new Date(p.created_at) < rangeStart).length ||
    0;

  const growthPerDay: Record<string, number> = {};
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const key = date.toISOString().split("T")[0];
    growthPerDay[key] = 0;
  }

  parentProfiles?.forEach((p) => {
    const key = new Date(p.created_at).toISOString().split("T")[0];
    if (growthPerDay[key] !== undefined) {
      growthPerDay[key]++;
    }
  });

  let cumulative = baseline;
  const userGrowth = Object.entries(growthPerDay).map(([date, count]) => {
    cumulative += count;
    return { date, users: cumulative };
  });

  return {
    dailyData,
    topQuestions,
    totalQuestions,
    uniqueUsers,
    totalDocuments: totalDocuments || 0,
    activeSessions: activeSessions || 0,
    documentTypes,
    hourlyDistribution,
    userGrowth,
    timeRange,
  };
}

export async function exportAnalyticsCSV(
  timeRange: TimeRange = "30d",
  schoolId?: string
): Promise<string> {
  const data = await getAnalyticsData(timeRange, schoolId);

  const rows = [
    ["Date", "Questions", "Cumulative Users"],
    ...data.dailyData.map((d, i) => [
      d.date,
      String(d.questions),
      String(data.userGrowth[i]?.users ?? ""),
    ]),
  ];

  return rows.map((r) => r.join(",")).join("\n");
}
