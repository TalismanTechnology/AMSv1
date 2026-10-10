"use client";

import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import {
  MessageSquare,
  Users,
  TrendingUp,
  FileText,
  MessageCircle,
  Download,
} from "lucide-react";
import { LogoSpinner } from "@/components/logo-spinner";
import { AnimatedNumber } from "@/components/motion";
import { cn } from "@/lib/utils";
import {
  getAnalyticsData,
  exportAnalyticsCSV,
  type AnalyticsData,
  type TimeRange,
} from "@/actions/analytics";

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

const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "all", label: "All time" },
];

interface AnalyticsClientProps {
  data: AnalyticsData;
  schoolId: string;
  schoolSlug: string;
}

export function AnalyticsClient({ data: initialData, schoolId }: AnalyticsClientProps) {
  const [data, setData] = useState(initialData);
  const [activeRange, setActiveRange] = useState<TimeRange>(initialData.timeRange);
  const [isPending, startTransition] = useTransition();
  const [exporting, setExporting] = useState(false);

  function handleRangeChange(range: TimeRange) {
    setActiveRange(range);
    startTransition(async () => {
      const newData = await getAnalyticsData(range, schoolId);
      setData(newData);
    });
  }

  async function handleExport() {
    setExporting(true);
    const csv = await exportAnalyticsCSV(activeRange, schoolId);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analytics-${activeRange}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  }

  const avgPerDay =
    data.dailyData.length > 0
      ? Math.round(
          data.dailyData.reduce((sum, d) => sum + d.questions, 0) /
            data.dailyData.length
        )
      : 0;

  return (
    <div>
      <header className="mb-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.01em] text-ink">
            Analytics
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            How your community engages with the assistant over time.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1">
            {TIME_RANGES.map((range) => (
              <button
                key={range.value}
                onClick={() => handleRangeChange(range.value)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  activeRange === range.value
                    ? "text-primary"
                    : "text-muted-foreground hover:text-ink"
                )}
              >
                {range.label}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? (
              <LogoSpinner size={14} className="mr-1" />
            ) : (
              <Download className="mr-1 h-3.5 w-3.5" />
            )}
            Export CSV
          </Button>
        </div>
      </header>

      {isPending && (
        <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <LogoSpinner />
          Loading...
        </div>
      )}

      {/* Summary cards */}
      <div className="mb-12 grid gap-8 border-y border-border py-8 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label={`Total Questions (${activeRange === "all" ? "all" : activeRange})`}
          value={data.totalQuestions}
          icon={<MessageSquare className="h-4 w-4" />}
        />
        <StatCard
          label="Unique Parents"
          value={data.uniqueUsers}
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          label="Avg Questions/Day"
          value={avgPerDay}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          label="Total Documents"
          value={data.totalDocuments}
          icon={<FileText className="h-4 w-4" />}
        />
        <StatCard
          label="Active Sessions"
          value={data.activeSessions}
          icon={<MessageCircle className="h-4 w-4" />}
        />
      </div>

      {/* Charts grid */}
      <div className="grid gap-8 lg:grid-cols-2">
        {/* Area Chart: Questions Trend */}
        <section className="rounded-xl border border-border p-5">
          <h2 className="mb-4 text-sm font-semibold text-ink">
            Questions Trend
          </h2>
          <div>
              {data.dailyData.some((d) => d.questions > 0) ? (
                <QuestionsTrendChart data={data.dailyData} />
              ) : (
                <div className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">
                  No question data yet
                </div>
              )}
          </div>
        </section>

        {/* Pie Chart: Document Types */}
        <section className="rounded-xl border border-border p-5">
          <h2 className="mb-4 text-sm font-semibold text-ink">
            Document Types
          </h2>
          <div>
              {data.documentTypes.length > 0 ? (
                <DocumentTypesChart data={data.documentTypes} />
              ) : (
                <div className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">
                  No documents uploaded yet
                </div>
              )}
          </div>
        </section>

        {/* Bar Chart: Questions by Hour */}
        <section className="rounded-xl border border-border p-5">
          <h2 className="mb-4 text-sm font-semibold text-ink">
            Questions by Hour
          </h2>
          <div>
              {data.hourlyDistribution.some((h) => h.count > 0) ? (
                <QuestionsByHourChart data={data.hourlyDistribution} />
              ) : (
                <div className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">
                  No message data yet
                </div>
              )}
          </div>
        </section>

        {/* Line Chart: User Growth */}
        <section className="rounded-xl border border-border p-5">
          <h2 className="mb-4 text-sm font-semibold text-ink">
            User Growth
          </h2>
          <div>
              {data.userGrowth.length > 0 &&
              data.userGrowth[data.userGrowth.length - 1].users > 0 ? (
                <UserGrowthChart data={data.userGrowth} />
              ) : (
                <div className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">
                  No user data yet
                </div>
              )}
          </div>
        </section>
      </div>

      {/* Top Questions - full width */}
      <div className="mt-12">
        <h2 className="mb-4 text-sm font-semibold text-ink">
          Most Asked Questions
        </h2>
        {data.topQuestions.length > 0 ? (
          <div className="divide-y divide-border">
            {data.topQuestions.map((q, i) => (
              <div
                key={i}
                className="flex items-start justify-between gap-4 py-3"
              >
                <div className="flex items-start gap-3">
                  <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                    {i + 1}
                  </span>
                  <p className="text-sm text-ink">{q.question}</p>
                </div>
                <span className="shrink-0 text-xs font-medium text-muted-foreground tabular-nums">
                  {q.count}x
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-[200px] flex-col items-center justify-center gap-2 text-center">
            <MessageSquare className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium text-ink">
              No questions asked yet
            </p>
            <p className="max-w-xs text-sm text-muted-foreground">
              Popular questions from parents will surface here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums tracking-[-0.01em] text-ink">
        <AnimatedNumber value={value} />
      </div>
    </div>
  );
}
