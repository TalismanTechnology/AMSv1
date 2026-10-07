"use client";

import { AlertCircle, ArrowRight, CheckCircle2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SortResult } from "@/actions/sorting";

/**
 * Where a sort run put each document: grouped by the category it landed in,
 * then the ones it couldn't place, each with its reason.
 */
export function SortSummaryDialog({
  results,
  onClose,
  onRetry,
}: {
  /** Null while there's nothing to show. */
  results: SortResult[] | null;
  onClose: () => void;
  onRetry: (docIds: string[]) => void;
}) {
  const filed = (results ?? []).filter((r) => r.label && !r.alreadyFiled);
  const already = (results ?? []).filter((r) => r.alreadyFiled);
  const failed = (results ?? []).filter((r) => !r.label);
  const retryable = failed.filter((r) => r.error !== "Still processing");

  const byPlace = new Map<string, SortResult[]>();
  for (const result of filed) {
    const list = byPlace.get(result.label!) ?? [];
    list.push(result);
    byPlace.set(result.label!, list);
  }
  const places = [...byPlace.entries()].sort(([a], [b]) => a.localeCompare(b));
  const total = (results ?? []).length;

  return (
    <Dialog open={!!results} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold tracking-[-0.01em] text-ink">
            Sorted {filed.length} of {total} document{total === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription>
            {failed.length
              ? `${failed.length} couldn't be sorted. The reasons are below.`
              : "Here's where each one went."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {places.map(([place, docs]) => (
            <div key={place}>
              <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
                <CheckCircle2 className="h-4 w-4 text-success" />
                {place}
                <span className="font-mono text-xs text-muted-foreground">
                  {docs.length}
                </span>
              </p>
              <ul className="mt-1 space-y-0.5 pl-6 text-sm text-ink-soft">
                {docs.map((d) => (
                  <li key={d.id} className="truncate" title={d.title}>
                    {d.title}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {failed.length > 0 && (
            <div>
              <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
                <AlertCircle className="h-4 w-4 text-destructive" />
                Not sorted
                <span className="font-mono text-xs text-muted-foreground">
                  {failed.length}
                </span>
              </p>
              <ul className="mt-1 space-y-1.5 pl-6 text-sm">
                {failed.map((d) => (
                  <li key={d.id}>
                    <p className="truncate text-ink-soft" title={d.title}>
                      {d.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {d.error ?? "No reason was given."}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {already.length > 0 && (
            <div>
              <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                Already filed, left as they were
                <span className="font-mono text-xs text-muted-foreground">
                  {already.length}
                </span>
              </p>
              <ul className="mt-1 space-y-0.5 pl-6 text-sm text-ink-soft">
                {already.map((d) => (
                  <li key={d.id} className="truncate" title={d.title}>
                    {d.title} · {d.label}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          {retryable.length > 0 && (
            <Button
              variant="outline"
              onClick={() => onRetry(retryable.map((d) => d.id))}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Try again ({retryable.length})
            </Button>
          )}
          <Button onClick={onClose}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
