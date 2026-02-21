"use client";

import { useState, useTransition } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  MessageSquare,
  Users,
  TrendingUp,
  FileText,
  MessageCircle,
  Download,
  Loader2,
} from "lucide-react";
import { AnimatedNumber } from "@/components/motion";
import { MagicBentoGrid, MagicBentoCard } from "@/components/magic-bento";
import { cn } from "@/lib/utils";
import {
  getAnalyticsData,
  exportAnalyticsCSV,
  type AnalyticsData,
  type TimeRange,
} from "@/actions/analytics";

const PIE_COLORS = ["#4682b4", "#536872", "#c0c0c0", "#e5e4e2", "#3a6d96", "#8a8a8a"];

const tooltipStyle = {
  backgroundColor: "#1a1a2e",
  border: "1px solid oklch(1 0 0 / 12%)",
  borderRadius: "0.5rem",
  color: "#e8e8e8",
  boxShadow: "0 4px 24px oklch(0 0 0 / 30%)",
};

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

export function AnalyticsClient({ data: initialData, schoolId, schoolSlug }: AnalyticsClientProps) {
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
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold metallic-heading">Analytics</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex rounded-lg border bg-muted/50 p-0.5">
            {TIME_RANGES.map((range) => (
              <button
                key={range.value}
                onClick={() => handleRangeChange(range.value)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  activeRange === range.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
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
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="mr-1 h-3.5 w-3.5" />
            )}
            Export CSV
          </Button>
        </div>
      </div>

      {isPending && (
        <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading...
        </div>
      )}

      {/* Summary cards */}
      <MagicBentoGrid className="mb-8 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        <MagicBentoCard enableBorderGlow enableParticles className="rounded-xl">
          <Card className="metallic-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Questions ({activeRange === "all" ? "all" : activeRange})
              </CardTitle>
              <MessageSquare className="h-4 w-4 text-chart-1" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                <AnimatedNumber value={data.totalQuestions} />
              </div>
            </CardContent>
          </Card>
        </MagicBentoCard>

        <MagicBentoCard enableBorderGlow enableParticles className="rounded-xl">
          <Card className="metallic-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Unique Parents
              </CardTitle>
              <Users className="h-4 w-4 text-chart-4" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                <AnimatedNumber value={data.uniqueUsers} />
              </div>
            </CardContent>
          </Card>
        </MagicBentoCard>

        <MagicBentoCard enableBorderGlow enableParticles className="rounded-xl">
          <Card className="metallic-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Avg Questions/Day
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-chart-3" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                <AnimatedNumber value={avgPerDay} />
              </div>
            </CardContent>
          </Card>
        </MagicBentoCard>

        <MagicBentoCard enableBorderGlow enableParticles className="rounded-xl">
          <Card className="metallic-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Documents
              </CardTitle>
              <FileText className="h-4 w-4 text-chart-2" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                <AnimatedNumber value={data.totalDocuments} />
              </div>
            </CardContent>
          </Card>
        </MagicBentoCard>

        <MagicBentoCard enableBorderGlow enableParticles className="rounded-xl">
          <Card className="metallic-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Active Sessions
              </CardTitle>
              <MessageCircle className="h-4 w-4 text-chart-5" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                <AnimatedNumber value={data.activeSessions} />
              </div>
            </CardContent>
          </Card>
        </MagicBentoCard>
      </MagicBentoGrid>

      {/* Charts grid */}
      <MagicBentoGrid className="grid gap-6 lg:grid-cols-2">
        {/* Area Chart: Questions Trend */}
        <MagicBentoCard enableBorderGlow enableParticles={false} className="rounded-xl">
          <Card className="metallic-card">
            <CardHeader>
              <CardTitle className="text-base">Questions Trend</CardTitle>
            </CardHeader>
            <CardContent>
              {data.dailyData.some((d) => d.questions > 0) ? (
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={data.dailyData}>
                    <defs>
                      <linearGradient
                        id="questionsGradient"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop offset="0%" stopColor="#4682b4" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#4682b4" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="oklch(1 0 0 / 8%)"
                    />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: "#536872", fontSize: 12 }}
                      tickFormatter={(v) => {
                        const d = new Date(v);
                        return `${d.getMonth() + 1}/${d.getDate()}`;
                      }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fill: "#536872", fontSize: 12 }}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelFormatter={(v) =>
                        new Date(v).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })
                      }
                    />
                    <Area
                      type="monotone"
                      dataKey="questions"
                      stroke="#4682b4"
                      fill="url(#questionsGradient)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[250px] items-center justify-center text-sm text-muted-foreground/70">
                  No question data yet
                </div>
              )}
            </CardContent>
          </Card>
        </MagicBentoCard>

        {/* Pie Chart: Document Types */}
        <MagicBentoCard enableBorderGlow enableParticles={false} className="rounded-xl">
          <Card className="metallic-card">
            <CardHeader>
              <CardTitle className="text-base">Document Types</CardTitle>
            </CardHeader>
            <CardContent>
              {data.documentTypes.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={data.documentTypes}
                      dataKey="count"
                      nameKey="type"
                      outerRadius={100}
                      label={(props) => {
                        const name = props.name ?? "";
                        const percent = typeof props.percent === "number" ? props.percent : 0;
                        return `${name} ${(percent * 100).toFixed(0)}%`;
                      }}
                    >
                      {data.documentTypes.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={PIE_COLORS[index % PIE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[250px] items-center justify-center text-sm text-muted-foreground/70">
                  No documents uploaded yet
                </div>
              )}
            </CardContent>
          </Card>
        </MagicBentoCard>

        {/* Bar Chart: Questions by Hour */}
        <MagicBentoCard enableBorderGlow enableParticles={false} className="rounded-xl">
          <Card className="metallic-card">
            <CardHeader>
              <CardTitle className="text-base">Questions by Hour</CardTitle>
            </CardHeader>
            <CardContent>
              {data.hourlyDistribution.some((h) => h.count > 0) ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={data.hourlyDistribution}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="oklch(1 0 0 / 8%)"
                    />
                    <XAxis
                      dataKey="hour"
                      tick={{ fill: "#536872", fontSize: 12 }}
                      tickFormatter={(h) => `${h}:00`}
                    />
                    <YAxis
                      tick={{ fill: "#536872", fontSize: 12 }}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelFormatter={(h) => `${h}:00 – ${h}:59`}
                    />
                    <Bar
                      dataKey="count"
                      fill="#536872"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[250px] items-center justify-center text-sm text-muted-foreground/70">
                  No message data yet
                </div>
              )}
            </CardContent>
          </Card>
        </MagicBentoCard>

        {/* Line Chart: User Growth */}
        <MagicBentoCard enableBorderGlow enableParticles={false} className="rounded-xl">
          <Card className="metallic-card">
            <CardHeader>
              <CardTitle className="text-base">User Growth</CardTitle>
            </CardHeader>
            <CardContent>
              {data.userGrowth.length > 0 &&
              data.userGrowth[data.userGrowth.length - 1].users > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={data.userGrowth}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="oklch(1 0 0 / 8%)"
                    />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: "#536872", fontSize: 12 }}
                      tickFormatter={(v) => {
                        const d = new Date(v);
                        return `${d.getMonth() + 1}/${d.getDate()}`;
                      }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fill: "#536872", fontSize: 12 }}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelFormatter={(v) =>
                        new Date(v).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })
                      }
                    />
                    <Line
                      type="monotone"
                      dataKey="users"
                      stroke="#e5e4e2"
                      strokeWidth={2}
                      dot={{ fill: "#c0c0c0", r: 3 }}
                      activeDot={{ fill: "#4682b4", r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[250px] items-center justify-center text-sm text-muted-foreground/70">
                  No user data yet
                </div>
              )}
            </CardContent>
          </Card>
        </MagicBentoCard>
      </MagicBentoGrid>

      {/* Top Questions - full width */}
      <div className="mt-6">
        <MagicBentoCard enableBorderGlow enableParticles={false} className="rounded-xl">
          <Card className="metallic-card">
            <CardHeader>
              <CardTitle className="text-base">Most Asked Questions</CardTitle>
            </CardHeader>
            <CardContent>
              {data.topQuestions.length > 0 ? (
                <div className="space-y-2">
                  {data.topQuestions.map((q, i) => (
                    <div
                      key={i}
                      className="flex items-start justify-between gap-4 rounded-lg px-3 py-2 hover:bg-glass-bg transition"
                    >
                      <div className="flex items-start gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full metallic-surface text-xs font-medium">
                          {i + 1}
                        </span>
                        <p className="text-sm text-foreground">{q.question}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                        {q.count}x
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground/70">
                  No questions asked yet
                </div>
              )}
            </CardContent>
          </Card>
        </MagicBentoCard>
      </div>
    </div>
  );
}
