"use client";

import Link from "next/link";
import { AnimatedNumber } from "@/components/motion";
import type { HeadlineMetrics } from "@/lib/metrics/definitions";
import type { DocumentMetrics } from "@/lib/metrics/load";

interface StatsCardsProps {
  metrics: HeadlineMetrics;
  documents: DocumentMetrics;
  analyticsHref: string;
}

/** The dashboard strip. Same numbers, windows and labels as admin Analytics. */
export function StatsCards({ metrics, documents, analyticsHref }: StatsCardsProps) {
  const { parents, questions, labels } = metrics;
  const stats = [
    {
      title: "Documents",
      value: documents.total,
      subtitle: `${documents.ready.toLocaleString()} ready · ${labels.allTime}`,
    },
    {
      title: "Parents",
      value: parents.total,
      subtitle:
        parents.pending > 0
          ? `${parents.pending.toLocaleString()} pending · ${labels.allTime}`
          : `All approved · ${labels.allTime}`,
    },
    {
      title: "Questions today",
      value: questions.today,
      subtitle: `${labels.today} · ${questions.allTime.toLocaleString()} all time`,
    },
    {
      title: "Avg questions / day",
      value: questions.avgPerDay7d,
      subtitle: `${labels.avgPerDay} · ${questions.last7d.toLocaleString()} asked`,
    },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 gap-x-8 gap-y-8 sm:gap-x-12 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.title} className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">{stat.title}</p>
            {Number.isInteger(stat.value) ? (
              <AnimatedNumber
                value={stat.value}
                className="text-2xl font-semibold tabular-nums text-ink"
              />
            ) : (
              <span className="text-2xl font-semibold tabular-nums text-ink">
                {stat.value.toFixed(1)}
              </span>
            )}
            <p className="text-xs text-muted-foreground">{stat.subtitle}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Days are Eastern time.{" "}
        <Link href={analyticsHref} className="font-medium text-primary hover:underline">
          See all analytics
        </Link>
      </p>
    </div>
  );
}
