"use client";

import { FileText, Users, MessageSquare, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnimatedNumber } from "@/components/motion";
import { MagicBentoGrid, MagicBentoCard } from "@/components/magic-bento";

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
      icon: FileText,
      color: "text-chart-1",
      bg: "bg-chart-1/10",
    },
    {
      title: "Parents",
      value: totalParents,
      subtitle: pendingParents > 0 ? `${pendingParents} pending` : "All approved",
      icon: Users,
      color: "text-chart-4",
      bg: "bg-chart-4/10",
    },
    {
      title: "Questions Today",
      value: questionsToday,
      subtitle: `${questionsTotal} total`,
      icon: MessageSquare,
      color: "text-chart-2",
      bg: "bg-chart-2/10",
    },
    {
      title: "Avg / Day",
      value:
        questionsTotal > 0
          ? Math.round(questionsTotal / 7)
          : 0,
      subtitle: "Last 7 days",
      icon: TrendingUp,
      color: "text-chart-3",
      bg: "bg-chart-3/10",
    },
  ];

  return (
    <MagicBentoGrid className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <MagicBentoCard key={stat.title} enableBorderGlow enableParticles className="rounded-xl">
          <Card className="metallic-card border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                {stat.title}
              </CardTitle>
              <div className={`rounded-lg ${stat.bg} p-2`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <AnimatedNumber
                value={stat.value}
                className="font-mono text-2xl font-semibold tabular-nums"
              />
              <p className="text-xs text-muted-foreground">{stat.subtitle}</p>
            </CardContent>
          </Card>
        </MagicBentoCard>
      ))}
    </MagicBentoGrid>
  );
}
