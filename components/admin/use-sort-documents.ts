"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { sortDocumentsNow, type SortResult } from "@/actions/sorting";

/** Matches what sortDocumentsNow takes per call. */
const BATCH = 4;

/**
 * Sort documents with AI right away, a few per request, with progress shown
 * as a toast. `sorting` holds the ones queued or in flight.
 */
export function useSortDocuments(schoolId: string) {
  const [sorting, setSorting] = useState<ReadonlySet<string>>(() => new Set());

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
      let failure: string | null = null;

      for (let i = 0; i < queue.length; i += BATCH) {
        const batch = queue.slice(i, i + BATCH);
        try {
          const response = await sortDocumentsNow(schoolId, batch);
          if (response.error) failure = response.error;
          results.push(...(response.results ?? []));
        } catch {
          failure = "Check your connection and try again.";
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
        // Stop early when the server turns the whole request away.
        if (failure && !results.length) break;
      }

      const filed = results.filter((r) => r.label);
      if (!many) {
        const [result] = results;
        if (result?.label) {
          toast.success(`Filed “${result.title}” under ${result.label}`);
        } else {
          toast.error(
            failure ??
              (result?.error
                ? `Couldn't sort “${result.title}”: ${result.error}`
                : `No category fits “${result?.title ?? "this document"}” yet`)
          );
        }
        return;
      }

      const missed = queue.length - filed.length;
      const summary = `Sorted ${filed.length} of ${queue.length} documents`;
      if (missed && failure) {
        toast.error(`${summary}. ${failure}`, { id: progress });
      } else if (missed) {
        toast.success(`${summary}. ${missed} still need a category.`, { id: progress });
      } else {
        toast.success(summary, { id: progress });
      }
    },
    [schoolId]
  );

  return { sorting, sort };
}
