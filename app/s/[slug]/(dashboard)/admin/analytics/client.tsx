"use client";

import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { toast } from "sonner";
import {
  MessageSquare,
  Users,
  UserCheck,
  CheckCircle2,
  Download,
  Tags,
  HelpCircle,
  Upload,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TimeAgo } from "@/components/ui/time-ago";
import { LogoSpinner } from "@/components/logo-spinner";
import { AnimatedNumber } from "@/components/motion";
import { cn } from "@/lib/utils";
import { getAnalyticsData, exportAnalyticsCSV, type AnalyticsData } from "@/actions/analytics";
import { MIN_TOPIC_QUESTIONS } from "@/lib/insights/aggregate";
import {
  DEFAULT_METRIC_RANGE,
  METRIC_RANGES,
  rangeOptionLabel,
  type MetricRange,
} from "@/lib/metrics/windows";
import { stripMarkdown } from "@/lib/markdown/normalize";

// Recharts is heavy and its ResponsiveContainer measures the DOM anyway, so
// the charts load client-side in their own chunk behind same-size placeholders.
function ChartPlaceholder() {
  return <div className="h-[250px] animate-pulse rounded-lg bg-muted/40" />;
}

const QuestionsTrendChart = dynamic(
  () => import("./charts").then((m) => m.QuestionsTrendChart),
  { ssr: false, loading: ChartPlaceholder }
);
const DocumentTypesChart = dynamic(
  () => import("./charts").then((m) => m.DocumentTypesChart),
  { ssr: false, loading: ChartPlaceholder }
);
const QuestionsByHourChart = dynamic(
  () => import("./charts").then((m) => m.QuestionsByHourChart),
  { ssr: false, loading: ChartPlaceholder }
);
const UserGrowthChart = dynamic(
  () => import("./charts").then((m) => m.UserGrowthChart),
  { ssr: false, loading: ChartPlaceholder }
);

interface AnalyticsClientProps {
  data: AnalyticsData;
  schoolId: string;
  schoolSlug: string;
}

const fmt = (n: number) => n.toLocaleString("en-US");
const fmtRate = (rate: number | null) => (rate === null ? "—" : `${rate}%`);

export function AnalyticsClient({ data: initialData, schoolId, schoolSlug }: AnalyticsClientProps) {
  const [data, setData] = useState(initialData);
  const [activeRange, setActiveRange] = useState<MetricRange>(initialData.metrics.range);
  const [isPending, startTransition] = useTransition();
  const [exporting, setExporting] = useState(false);
  const uploadHref = `/s/${schoolSlug}/admin/documents?upload=1`;

  const { metrics, documents, topics } = data;
  const { labels } = metrics;

  function handleRangeChange(range: MetricRange) {
    if (range === activeRange) return;
    const previous = activeRange;
    setActiveRange(range);
    const url = new URL(window.location.href);
    if (range === DEFAULT_METRIC_RANGE) url.searchParams.delete("range");
    else url.searchParams.set("range", range);
    window.history.replaceState(null, "", url.toString());
    startTransition(async () => {
      try {
        setData(await getAnalyticsData(schoolId, range));
      } catch {
        setActiveRange(previous);
        toast.error("Couldn't load analytics. Please try again.");
      }
    });
  }

  async function handleExport() {
    setExporting(true);
    try {
      const csv = await exportAnalyticsCSV(schoolId, activeRange);
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `analytics-${activeRange}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Couldn't export. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  const maxTopicCount = topics.topics[0]?.count ?? 0;
  const hasQuestions = metrics.questions.inRange > 0;

  return (
    <div>
      <header className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.01em] text-ink">Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            How families use the assistant, what they ask about, and where it needs more to go on.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isPending && <LogoSpinner size={14} />}
          <div
            role="radiogroup"
            aria-label="Time range"
            aria-describedby="range-scope"
            className="flex gap-1 rounded-full border border-border p-0.5"
          >
            {METRIC_RANGES.map((range) => (
              <button
                key={range}
                type="button"
                role="radio"
                aria-checked={activeRange === range}
                onClick={() => handleRangeChange(range)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  activeRange === range
                    ? "bg-secondary text-primary"
                    : "text-muted-foreground hover:text-ink"
                )}
              >
                {rangeOptionLabel(range)}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
            {exporting ? (
              <LogoSpinner size={14} className="mr-1" />
            ) : (
              <Download className="mr-1 h-3.5 w-3.5" />
            )}
            Export CSV
          </Button>
        </div>
      </header>

      <p id="range-scope" className="mb-4 text-xs text-muted-foreground">
        The range (<span className="font-medium text-primary">{labels.range}</span>) applies to cards
        tagged with it, every chart except document types, and Topics &amp; questions. Other cards
        use the fixed window shown on them. Days and hours are Eastern time.
      </p>

      <div className={cn("transition-opacity", isPending && "opacity-60")}>
        {/* Headline KPIs */}
        <div className="grid grid-cols-2 gap-6 border-y border-border py-6 sm:gap-8 sm:py-8 lg:grid-cols-4">
          <StatCard
            label="Total parents"
            icon={<Users className="h-4 w-4" />}
            window={labels.allTime}
            value={<AnimatedNumber value={metrics.parents.total} />}
            sub={`+${fmt(metrics.parents.new7d)} ${labels.newParents.toLowerCase()} · ${fmt(metrics.parents.pending)} pending`}
          />
          <StatCard
            label="Active parents"
            icon={<UserCheck className="h-4 w-4" />}
            window={labels.activeParents}
            value={<AnimatedNumber value={metrics.activeParents.last7d} />}
            sub={
              metrics.range === "7d"
                ? "Asked at least one question"
                : `${fmt(metrics.activeParents.inRange)} in ${labels.range.toLowerCase()}`
            }
          />
          <StatCard
            label="Questions asked"
            icon={<MessageSquare className="h-4 w-4" />}
            window={labels.range}
            ranged
            value={<AnimatedNumber key={`q-${metrics.range}`} value={metrics.questions.inRange} />}
            sub={`${fmt(metrics.questions.today)} today (ET) · ${fmt(metrics.questions.allTime)} all time`}
          />
          <StatCard
            label="Answer rate"
            icon={<CheckCircle2 className="h-4 w-4" />}
            window={labels.range}
            ranged
            value={fmtRate(metrics.answerRate.inRange)}
            sub={`${fmtRate(metrics.answerRate.last30d)} ${labels.answerRate.toLowerCase()}`}
          />
        </div>

        {/* Secondary numbers */}
        <dl className="mb-12 grid grid-cols-2 gap-x-6 gap-y-5 border-b sm:gap-x-8 border-border py-5 text-sm lg:grid-cols-4">
          <MiniStat
            label="Avg questions / day"
            window={labels.range}
            ranged
            value={metrics.questions.avgPerDayInRange.toFixed(1)}
          />
          <MiniStat
            label="Avg questions / day"
            window={labels.avgPerDay}
            value={metrics.questions.avgPerDay7d.toFixed(1)}
          />
          <MiniStat label="Chats with activity" window={labels.range} ranged value={fmt(data.activeChats)} />
          <MiniStat
            label="Documents ready"
            window={labels.allTime}
            value={`${fmt(documents.ready)} of ${fmt(documents.total)}`}
          />
        </dl>

        {/* Charts */}
        <div className="grid gap-8 lg:grid-cols-2">
          <ChartCard title="Questions per day" window={labels.range} ranged>
            {metrics.questionsByDay.some((d) => d.count > 0) ? (
              <QuestionsTrendChart data={metrics.questionsByDay} />
            ) : (
              <EmptyChart>No questions in this range</EmptyChart>
            )}
          </ChartCard>

          <ChartCard title="Total parents" window={labels.range} ranged>
            {metrics.parentGrowth.some((d) => d.total > 0) ? (
              <UserGrowthChart data={metrics.parentGrowth} />
            ) : (
              <EmptyChart>No approved parents yet</EmptyChart>
            )}
          </ChartCard>

          <ChartCard title="Questions by hour (ET)" window={labels.range} ranged>
            {metrics.questionsByHour.some((h) => h.count > 0) ? (
              <QuestionsByHourChart data={metrics.questionsByHour} />
            ) : (
              <EmptyChart>No questions in this range</EmptyChart>
            )}
          </ChartCard>

          <ChartCard title="Ready documents by type" window={labels.allTime}>
            {documents.byType.length > 0 ? (
              <DocumentTypesChart data={documents.byType} />
            ) : (
              <EmptyChart>No documents uploaded yet</EmptyChart>
            )}
          </ChartCard>
        </div>

        {/* Topics & questions (formerly Insights) */}
        <section id="topics" className="mt-14 scroll-mt-6">
          <div className="mb-6 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink">Topics &amp; questions</h2>
            <WindowTag ranged>{labels.range}</WindowTag>
          </div>

          <div className="grid gap-12 lg:grid-cols-5 lg:gap-10">
            {/* Top topics */}
            <div className="min-w-0 lg:col-span-2">
              <div className="mb-1 flex items-center gap-2">
                <Tags className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-ink">Top topics</h3>
              </div>
              <p className="mb-5 text-xs text-muted-foreground">Topics updated daily.</p>

              {topics.topics.length > 0 ? (
                <ul className="space-y-4">
                  {topics.topics.map((topic) => (
                    <li key={topic.label}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-sm text-ink">
                          {stripMarkdown(topic.label, { singleLine: true })}
                        </span>
                        <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                          {topic.count}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary/70"
                          style={{
                            width: `${maxTopicCount > 0 ? Math.max(4, (topic.count / maxTopicCount) * 100) : 0}%`,
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="rounded-xl border border-border px-6 py-10 text-center">
                  <Tags className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
                  <p className="text-sm font-medium text-ink">No topics to show yet</p>
                  <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
                    {hasQuestions
                      ? "Topics appear once several parents ask about the same thing."
                      : "Topics will appear here as parents start asking questions."}
                  </p>
                </div>
              )}

              <p className="mt-5 flex items-start gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0" />
                <span>
                  Topics with fewer than {MIN_TOPIC_QUESTIONS} questions (or {MIN_TOPIC_QUESTIONS}{" "}
                  different parents) are hidden to protect parent privacy.
                  {topics.hiddenTopicCount > 0 &&
                    ` ${topics.hiddenTopicCount} ${topics.hiddenTopicCount === 1 ? "topic" : "topics"} hidden.`}
                </span>
              </p>
            </div>

            {/* Flagged questions */}
            <div className="min-w-0 lg:col-span-3">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <HelpCircle className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-ink">Questions we couldn&apos;t answer</h3>
                  {topics.unanswered.length > 0 && (
                    <Badge variant="secondary">{topics.unanswered.length}</Badge>
                  )}
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href={uploadHref}>
                    <Upload className="h-3.5 w-3.5" />
                    Upload a document
                  </Link>
                </Button>
              </div>
              <p className="mb-5 text-xs text-muted-foreground">
                Questions the assistant found no answer for, or that a parent marked unhelpful. Upload
                a document that covers them so it can answer next time.
              </p>

              {topics.unanswered.length > 0 ? (
                <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                  {topics.unanswered.map((group) => (
                    <li key={group.key} className="flex items-start gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 break-words text-sm font-medium text-ink">
                          {group.text}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          <span className="tabular-nums">
                            Asked {group.count} {group.count === 1 ? "time" : "times"}
                          </span>
                          <span aria-hidden>·</span>
                          <TimeAgo date={group.lastAskedAt} />
                          {group.reasons.map((reason) => (
                            <Badge
                              key={reason}
                              variant="outline"
                              className={cn(
                                "font-normal",
                                reason === "unhelpful" &&
                                  "border-red-500/30 text-red-600 dark:text-red-400"
                              )}
                            >
                              {reason === "unhelpful" ? "Marked unhelpful" : "No answer"}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <Button
                        asChild
                        variant="ghost"
                        size="sm"
                        className="shrink-0 text-muted-foreground hover:text-ink"
                      >
                        <Link href={uploadHref} aria-label="Upload a document for this question">
                          <Upload className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Upload</span>
                        </Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="rounded-xl border border-border px-6 py-10 text-center">
                  <HelpCircle className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
                  <p className="text-sm font-medium text-ink">Nothing to fix right now</p>
                  <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
                    {hasQuestions
                      ? `Nothing was flagged in ${labels.range.toLowerCase()}.`
                      : `No questions were asked in ${labels.range.toLowerCase()}.`}
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

/** The window a number covers. Range-driven ones are tinted to match the selector. */
function WindowTag({ children, ranged = false }: { children: ReactNode; ranged?: boolean }) {
  return (
    <span
      className={cn(
        "text-[11px] font-medium uppercase tracking-[0.04em]",
        ranged ? "text-primary" : "text-muted-foreground"
      )}
    >
      {children}
    </span>
  );
}

function StatCard({
  label,
  icon,
  window,
  ranged,
  value,
  sub,
}: {
  label: string;
  icon: ReactNode;
  window: string;
  ranged?: boolean;
  value: ReactNode;
  sub: string;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="hidden sm:inline-flex">{icon}</span>
        <span className="text-xs leading-tight sm:text-sm">{label}</span>
      </div>
      <WindowTag ranged={ranged}>{window}</WindowTag>
      <div className="mt-1 text-2xl font-semibold tabular-nums tracking-[-0.01em] text-ink">
        {value}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function MiniStat({
  label,
  window,
  ranged,
  value,
}: {
  label: string;
  window: string;
  ranged?: boolean;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">
        {/* Two lines on phones, where "label · WINDOW" wraps mid-tag. */}
        <span className="block lg:inline">{label}</span>
        <span className="hidden lg:inline"> · </span>
        <WindowTag ranged={ranged}>{window}</WindowTag>
      </dt>
      <dd className="mt-0.5 font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  );
}

function ChartCard({
  title,
  window,
  ranged,
  children,
}: {
  title: string;
  window: string;
  ranged?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        <WindowTag ranged={ranged}>{window}</WindowTag>
      </div>
      {children}
    </section>
  );
}

function EmptyChart({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
