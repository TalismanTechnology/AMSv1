"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { sortDocumentsNow, type SortResult } from "@/actions/sorting";

/** Matches what sortDocumentsNow takes per call. */
const BATCH = 4;

/**
 * Sort documents with AI right away, a few per request. Progress shows as a
 * toast; when a run of several finishes, `summary` holds where each one went
 * (for SortSummaryDialog) until `dismissSummary`. A single document gets a
 * toast instead. `sorting` holds the ones queued or in flight.
 */
export function useSortDocuments(schoolId: string) {
  const [sorting, setSorting] = useState<ReadonlySet<string>>(() => new Set());
  const [summary, setSummary] = useState<SortResult[] | null>(null);

  const sort = useCallback(
    async (docIds: string[]) => {
      const queue = [...new Set(docIds)];
      if (!queue.length) return;
      setSorting((prev) => new Set([...prev, ...queue]));

      const many = queue.length > 1;
      const progress = many
        ? toast.loading(`Sorting ${queue.length} documents…`)
        : undefined;
      const results: SortResult[] = [];

      for (let i = 0; i < queue.length; i += BATCH) {
        const batch = queue.slice(i, i + BATCH);
        let batchError: string | null = null;
        try {
          const response = await sortDocumentsNow(schoolId, batch);
          if (response.error) batchError = response.error;
          results.push(...(response.results ?? []));
        } catch {
          batchError = "The request didn't go through. Check your connection and try again.";
        }
        // A request turned away as a whole still accounts for each document.
        if (batchError) {
          for (const id of batch) {
            if (!results.some((r) => r.id === id)) {
              results.push({ id, title: "Untitled document", error: batchError });
            }
          }
        }
        setSorting((prev) => {
          const next = new Set(prev);
          for (const id of batch) next.delete(id);
          return next;
        });
        if (progress) {
          toast.loading(
            `Sorting documents… ${Math.min(i + BATCH, queue.length)} of ${queue.length}`,
            { id: progress }
          );
        }
      }

      if (many) {
        toast.dismiss(progress);
        setSummary(results);
        return;
      }

      const [result] = results;
      if (result?.label) {
        toast.success(
          result.alreadyFiled
            ? `“${result.title}” is already filed under ${result.label}`
            : `Filed “${result.title}” under ${result.label}`
        );
      } else {
        toast.error(
          `Couldn't sort “${result?.title ?? "this document"}”: ${result?.error ?? "no reason was given"}`
        );
      }
    },
    [schoolId]
  );

  const dismissSummary = useCallback(() => setSummary(null), []);

  return { sorting, sort, summary, dismissSummary };
}
