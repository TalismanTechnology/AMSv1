"use client";

import { useMemo } from "react";
import { SelectGroup, SelectItem, SelectLabel } from "@/components/ui/select";
import {
  categoryLabels,
  groupCategories,
  type DivisionLike,
} from "@/lib/documents/division-categories";
import type { Category } from "@/lib/types";

/**
 * Category options for a <Select>, under a heading per division once the
 * school groups categories that way. Pair with useCategoryLabels so the
 * closed select reads "Upper School · Academics", not a bare "Academics".
 */
export function CategorySelectItems({
  categories,
  divisions,
}: {
  categories: Category[];
  divisions: DivisionLike[];
}) {
  const groups = groupCategories(categories, divisions);

  if (groups.length <= 1) {
    return (groups[0]?.categories ?? []).map((c) => (
      <SelectItem key={c.id} value={c.id}>
        {c.name}
      </SelectItem>
    ));
  }

  return groups.map((group) => (
    <SelectGroup key={group.divisionId ?? "whole-school"}>
      <SelectLabel>{group.name}</SelectLabel>
      {group.categories.map((c) => (
        <SelectItem key={c.id} value={c.id}>
          {c.name}
        </SelectItem>
      ))}
    </SelectGroup>
  ));
}

/** Each category's full name, e.g. "Upper School · Academics". */
export function useCategoryLabels(
  categories: Category[],
  divisions: DivisionLike[]
): Map<string, string> {
  return useMemo(
    () => categoryLabels(categories, divisions),
    [categories, divisions]
  );
}
