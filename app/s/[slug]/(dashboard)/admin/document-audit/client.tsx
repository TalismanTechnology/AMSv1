"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  ShieldCheck,
  Play,
  CheckCircle2,
  XCircle,
  FileText,
  ChevronRight,
  X,
} from "lucide-react";
import { LogoSpinner } from "@/components/logo-spinner";
import { formatDistanceToNow } from "date-fns";
import { runDocumentAudit, type StoredAudit } from "@/actions/document-audit";
import type { AuditResult, CategoryResult } from "@/lib/ai/document-audit";
import {
  SCHOOL_CHECKLIST,
  CHECKLIST_BY_ID,
  TOTAL_CHECKLIST_ITEMS,
} from "@/lib/ai/school-checklist";

type GlobalFilter = "all" | "missing" | "covered";
type PriorityFilter = "all" | "critical" | "recommended" | "nice-to-have";

function scoreColor(pct: number) {
  if (pct >= 75) return "text-green-500";
  if (pct >= 50) return "text-amber-500";
  return "text-red-500";
}

function progressCls(pct: number) {
  if (pct >= 75) return "[&>div]:bg-green-500";
  if (pct >= 50) return "[&>div]:bg-amber-500";
  return "[&>div]:bg-red-500";
}

export function DocumentAuditClient({
  audit,
  schoolId,
}: {
  audit: StoredAudit | null;
  schoolId: string;
  schoolSlug: string;
}) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<GlobalFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const rawGaps = audit?.gaps as unknown;
  const auditData: AuditResult | null =
    rawGaps &&
    typeof rawGaps === "object" &&
    "categories" in (rawGaps as Record<string, unknown>)
      ? (rawGaps as AuditResult)
      : null;

  const stats = useMemo(() => {
    if (!auditData) return null;
    let critTotal = 0,
      critCov = 0,
      recTotal = 0,
      recCov = 0;
    for (const cat of auditData.categories) {
      for (const item of cat.items) {
        const ci = CHECKLIST_BY_ID.get(item.itemId);
        if (!ci) continue;
        if (ci.priority === "critical") {
          critTotal++;
          if (item.status === "covered") critCov++;
        } else if (ci.priority === "recommended") {
          recTotal++;
          if (item.status === "covered") recCov++;
        }
      }
    }
    return { critTotal, critCov, recTotal, recCov };
  }, [auditData]);

  // Global item filter
  function matchesFilter(item: { itemId: string; status: string }) {
    if (statusFilter !== "all" && item.status !== statusFilter) return false;
    if (priorityFilter !== "all") {
      const ci = CHECKLIST_BY_ID.get(item.itemId);
      if (ci && ci.priority !== priorityFilter) return false;
    }
    return true;
  }

  const isFiltered = statusFilter !== "all" || priorityFilter !== "all";

  // Filtered categories for the table
  const filteredCategories = useMemo(() => {
    if (!auditData) return [];
    if (!isFiltered) return auditData.categories;
    return auditData.categories.filter((cat) =>
      cat.items.some(matchesFilter)
    );
  }, [auditData, statusFilter, priorityFilter]);

  // Selected category detail
  const selectedCat = auditData?.categories.find(
    (c) => c.categoryId === selectedCategory
  );
  const selectedItems = useMemo(() => {
    if (!selectedCat) return [];
    return selectedCat.items.filter(matchesFilter);
  }, [selectedCat, statusFilter, priorityFilter]);

  function handleRunAudit() {
    startTransition(async () => {
      await runDocumentAudit(schoolId);
      router.refresh();
    });
  }

  function getMissingCritical(cat: CategoryResult) {
    return cat.items.filter((i) => {
      const ci = CHECKLIST_BY_ID.get(i.itemId);
      return i.status === "missing" && ci?.priority === "critical";
    }).length;
  }

  return (
    <div className="p-4 md:p-6 flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Header row */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <h1 className="text-xl font-bold metallic-heading">Document Audit</h1>
          <p className="text-xs text-muted-foreground">
            {audit
              ? `Last run ${formatDistanceToNow(new Date(audit.created_at), { addSuffix: true })} · ${audit.document_count} docs · ${TOTAL_CHECKLIST_ITEMS} criteria`
              : `${TOTAL_CHECKLIST_ITEMS} criteria across ${SCHOOL_CHECKLIST.length} categories`}
          </p>
        </div>
        <Button size="sm" onClick={handleRunAudit} disabled={isPending}>
          {isPending ? (
            <LogoSpinner size={14} className="mr-1.5" />
          ) : (
            <Play className="h-3.5 w-3.5 mr-1.5" />
          )}
          {audit ? "Re-run" : "Run Audit"}
        </Button>
      </div>

      {/* Loading */}
      {isPending && !auditData && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <LogoSpinner size={40} />
          <p className="text-sm text-muted-foreground">
            Analyzing against {TOTAL_CHECKLIST_ITEMS} items...
          </p>
        </div>
      )}

      {/* Empty state */}
      {!auditData && !isPending && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <ShieldCheck className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground max-w-sm text-center">
            Run your first audit to compare your documents against{" "}
            {TOTAL_CHECKLIST_ITEMS} checklist items.
          </p>
        </div>
      )}

      {/* Results */}
      {auditData && stats && (
        <div className="flex flex-col flex-1 min-h-0 gap-3">
          {/* Stat bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
            <StatPill
              label="Overall"
              value={`${auditData.overallScore}%`}
              sub={`${auditData.totalCovered}/${auditData.totalItems}`}
              color={scoreColor(auditData.overallScore)}
            />
            <StatPill
              label="Critical"
              value={`${stats.critCov}/${stats.critTotal}`}
              sub={`${stats.critTotal - stats.critCov} missing`}
              color={scoreColor(
                stats.critTotal > 0
                  ? (stats.critCov / stats.critTotal) * 100
                  : 100
              )}
            />
            <StatPill
              label="Recommended"
              value={`${stats.recCov}/${stats.recTotal}`}
              sub={`${stats.recTotal - stats.recCov} missing`}
              color={scoreColor(
                stats.recTotal > 0
                  ? (stats.recCov / stats.recTotal) * 100
                  : 100
              )}
            />
            <StatPill
              label="Documents"
              value={`${audit!.document_count}`}
              sub={`${SCHOOL_CHECKLIST.length} categories`}
              color="text-foreground"
            />
          </div>

          {/* Global filters */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="flex gap-1">
              {(["all", "missing", "covered"] as const).map((f) => (
                <Button
                  key={f}
                  variant={statusFilter === f ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    setStatusFilter(f);
                    setSelectedCategory(null);
                  }}
                >
                  {f === "all" ? "All" : f === "missing" ? "Missing" : "Covered"}
                </Button>
              ))}
            </div>
            <span className="text-muted-foreground text-xs">|</span>
            <div className="flex gap-1">
              {(["all", "critical", "recommended", "nice-to-have"] as const).map((f) => (
                <Button
                  key={f}
                  variant={priorityFilter === f ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    setPriorityFilter(f);
                    setSelectedCategory(null);
                  }}
                >
                  {f === "all"
                    ? "All Priority"
                    : f === "critical"
                      ? "Critical"
                      : f === "recommended"
                        ? "Recommended"
                        : "Nice to Have"}
                </Button>
              ))}
            </div>
            {isFiltered && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                onClick={() => {
                  setStatusFilter("all");
                  setPriorityFilter("all");
                  setSelectedCategory(null);
                }}
              >
                <X className="h-3 w-3 mr-1" />
                Clear
              </Button>
            )}
          </div>

          {/* Main content: table + detail panel */}
          <div className="flex flex-1 min-h-0 gap-3">
            {/* Category table */}
            <div
              className={`flex flex-col min-h-0 ${selectedCategory ? "w-1/2" : "w-full"} transition-all`}
            >
              <div className="overflow-y-auto rounded-lg border bg-card">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card z-10 border-b">
                    <tr className="text-xs text-muted-foreground">
                      <th className="text-left font-medium px-3 py-2">
                        Category
                      </th>
                      <th className="text-center font-medium px-2 py-2 w-20 hidden sm:table-cell">
                        Coverage
                      </th>
                      <th className="text-right font-medium px-3 py-2 w-16">
                        Score
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCategories.map((cat) => {
                      const filtered = cat.items.filter(matchesFilter);
                      const covCount = filtered.filter(
                        (i) => i.status === "covered"
                      ).length;
                      const totalCount = filtered.length;
                      const pct =
                        totalCount > 0
                          ? Math.round((covCount / totalCount) * 100)
                          : 0;
                      const missCrit = isFiltered
                        ? 0
                        : getMissingCritical(cat);
                      const isSelected =
                        selectedCategory === cat.categoryId;

                      return (
                        <tr
                          key={cat.categoryId}
                          onClick={() =>
                            setSelectedCategory(
                              isSelected ? null : cat.categoryId
                            )
                          }
                          className={`cursor-pointer border-b last:border-0 transition-colors ${
                            isSelected
                              ? "bg-accent"
                              : "hover:bg-accent/50"
                          }`}
                        >
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className="font-medium truncate">
                                {cat.categoryName}
                              </span>
                              {missCrit > 0 && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] px-1 py-0 border-red-500/30 text-red-400 shrink-0"
                                >
                                  {missCrit}
                                </Badge>
                              )}
                            </div>
                            <div className="sm:hidden mt-1">
                              <Progress
                                value={pct}
                                className={`h-1 ${progressCls(pct)}`}
                              />
                            </div>
                          </td>
                          <td className="px-2 py-2 hidden sm:table-cell">
                            <Progress
                              value={pct}
                              className={`h-1.5 ${progressCls(pct)}`}
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <span
                              className={`font-bold text-xs ${scoreColor(pct)}`}
                            >
                              {covCount}/{totalCount}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Detail panel */}
            {selectedCat && (
              <div className="w-1/2 flex flex-col min-h-0 rounded-lg border bg-card">
                {/* Panel header */}
                <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold truncate">
                      {selectedCat.categoryName}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {selectedCat.coveredItems}/{selectedCat.totalItems}{" "}
                      covered
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 shrink-0"
                    onClick={() => setSelectedCategory(null)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Items list */}
                <div className="overflow-y-auto flex-1 px-3">
                  {selectedItems.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">
                      No items match this filter.
                    </p>
                  ) : (
                    selectedItems.map((item) => {
                      const ci = CHECKLIST_BY_ID.get(item.itemId);
                      if (!ci) return null;
                      return (
                        <div
                          key={item.itemId}
                          className="flex items-start gap-2 py-1.5 border-b last:border-0"
                        >
                          {item.status === "covered" ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-medium truncate">
                                {ci.name}
                              </span>
                              <Badge
                                variant="outline"
                                className={`text-[9px] px-1 py-0 shrink-0 ${
                                  ci.priority === "critical"
                                    ? "border-red-500/30 text-red-400"
                                    : ci.priority === "recommended"
                                      ? "border-amber-500/30 text-amber-400"
                                      : "border-zinc-500/30 text-zinc-400"
                                }`}
                              >
                                {ci.priority}
                              </Badge>
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-tight">
                              {ci.description}
                            </p>
                            {item.status === "covered" &&
                              item.matchedDocument && (
                                <p className="text-[11px] text-green-500/70 flex items-center gap-0.5 mt-0.5">
                                  <FileText className="h-2.5 w-2.5" />
                                  {item.matchedDocument}
                                </p>
                              )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatPill({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      <p className={`text-lg font-bold leading-tight ${color}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{sub}</p>
    </div>
  );
}
