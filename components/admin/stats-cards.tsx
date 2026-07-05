"use client";

import { AnimatedNumber } from "@/components/motion";

interface StatsCardsProps {
  totalDocuments: number;
  readyDocuments: number;
  totalParents: number;
  pendingParents: number;
  questionsToday: number;
  questionsTotal: number;
}

export function StatsCards({
  totalDocuments,
  readyDocuments,
  totalParents,
  pendingParents,
  questionsToday,
  questionsTotal,
}: StatsCardsProps) {
  const stats = [
    {
      title: "Documents",
      value: totalDocuments,
      subtitle: `${readyDocuments} ready`,
    },
    {
      title: "Parents",
      value: totalParents,
      subtitle: pendingParents > 0 ? `${pendingParents} pending` : "All approved",
    },
    {
      title: "Questions Today",
      value: questionsToday,
      subtitle: `${questionsTotal} total`,
    },
    {
      title: "Avg / Day",
      value: questionsTotal > 0 ? Math.round(questionsTotal / 7) : 0,
      subtitle: "Last 7 days",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-8 sm:gap-x-12 lg:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.title} className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">{stat.title}</p>
          <AnimatedNumber
            value={stat.value}
            className="text-2xl font-semibold tabular-nums text-ink"
          />
          <p className="text-xs text-muted-foreground">{stat.subtitle}</p>
        </div>
      ))}
    </div>
  );
}
