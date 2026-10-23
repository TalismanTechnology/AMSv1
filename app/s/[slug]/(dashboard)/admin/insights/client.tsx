"use client";

import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  MessageSquare,
  Users,
  CheckCircle2,
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
import { getInsightsData, type InsightsData } from "@/actions/insights";
import {
  MIN_TOPIC_QUESTIONS,
  RANGE_DAYS,
  type RangeDays,
} from "@/lib/insights/aggregate";
import { stripMarkdown } from "@/lib/markdown/normalize";

interface InsightsClientProps {
  data: InsightsData;
  schoolId: string;
  schoolSlug: string;
}

export function InsightsClient({ data: initialData, schoolId, schoolSlug }: InsightsClientProps) {
  const [data, setData] = useState(initialData);
  const [activeRange, setActiveRange] = useState<RangeDays>(initialData.rangeDays);
  const [isPending, startTransition] = useTransition();
  const uploadHref = `/s/${schoolSlug}/admin/documents?upload=1`;

  function handleRangeChange(range: RangeDays) {
    if (range === activeRange) return;
    const previous = activeRange;
    setActiveRange(range);
    const url = new URL(window.location.href);
    if (range === 30) url.searchParams.delete("range");
    else url.searchParams.set("range", String(range));
    window.history.replaceState(null, "", url.toString());
    startTransition(async () => {
      try {
        setData(await getInsightsData(schoolId, range));
      } catch {
        setActiveRange(previous);
        toast.error("Couldn't load insights. Please try again.");
      }
    });
  }

  const maxTopicCount = data.topics[0]?.count ?? 0;

  return (
    <div>
      <header className="mb-8 flex flex-col gap-4 sm:mb-10 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.01em] text-ink">Insights</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            What parents are asking about, and where the assistant needs more to go on.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isPending && <LogoSpinner size={14} />}
          <div
            role="radiogroup"
            aria-label="Time range"
            className="flex gap-1 rounded-full border border-border p-0.5"
          >
            {RANGE_DAYS.map((range) => (
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
                {range} days
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className={cn("transition-opacity", isPending && "opacity-60")}>
        {/* Stat cards */}
        <div className="mb-10 grid grid-cols-3 gap-4 border-y border-border py-6 sm:mb-12 sm:gap-8 sm:py-8">
          <StatCard
            label="Questions asked"
            icon={<MessageSquare className="h-4 w-4" />}
            value={<AnimatedNumber key={`q-${data.rangeDays}`} value={data.questions} />}
          />
          <StatCard
            label="Active parents"
            icon={<Users className="h-4 w-4" />}
            value={<AnimatedNumber key={`p-${data.rangeDays}`} value={data.activeParents} />}
          />
          <StatCard
            label="Answer rate"
            icon={<CheckCircle2 className="h-4 w-4" />}
            value={data.answerRate === null ? "—" : `${data.answerRate}%`}
          />
        </div>

        <div className="grid gap-12 lg:grid-cols-5 lg:gap-10">
          {/* Top topics */}
          <section className="min-w-0 lg:col-span-2">
            <div className="mb-1 flex items-center gap-2">
              <Tags className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink">Top topics</h2>
            </div>
            <p className="mb-5 text-xs text-muted-foreground">Topics updated daily.</p>

            {data.topics.length > 0 ? (
              <ul className="space-y-4">
                {data.topics.map((topic) => (
                  <li key={topic.label}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-sm text-ink">{stripMarkdown(topic.label, { singleLine: true })}</span>
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
                  {data.questions > 0
                    ? "Topics appear once several parents ask about the same thing."
                    : "Topics will appear here as parents start asking questions."}
                </p>
              </div>
            )}

            <p className="mt-5 flex items-start gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>
                Topics with fewer than {MIN_TOPIC_QUESTIONS} questions (or {MIN_TOPIC_QUESTIONS} different
                parents) are hidden to protect parent privacy.
                {data.hiddenTopicCount > 0 &&
                  ` ${data.hiddenTopicCount} ${data.hiddenTopicCount === 1 ? "topic" : "topics"} hidden.`}
              </span>
            </p>
          </section>

          {/* Flagged questions */}
          <section className="min-w-0 lg:col-span-3">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <HelpCircle className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink">
                  Questions we couldn&apos;t answer
                </h2>
                {data.unanswered.length > 0 && (
                  <Badge variant="secondary">{data.unanswered.length}</Badge>
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
              Questions the assistant found no answer for, or that a parent marked unhelpful. Upload a
              document that covers them so it can answer next time.
            </p>

            {data.unanswered.length > 0 ? (
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                {data.unanswered.map((group) => (
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
                  {data.questions > 0
                    ? `Nothing was flagged in the last ${data.rangeDays} days.`
                    : `No questions were asked in the last ${data.rangeDays} days.`}
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: ReactNode; icon: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="hidden sm:inline-flex">{icon}</span>
        <span className="text-xs leading-tight sm:text-sm">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums tracking-[-0.01em] text-ink">
        {value}
      </div>
    </div>
  );
}
