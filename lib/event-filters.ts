interface FilterableEvent {
  label_id: string | null;
}

/** Filter key for events with no label, which get a chip of their own. */
export const UNLABELED_FILTER_ID = "unlabeled";

function filterKey(event: FilterableEvent): string {
  return event.label_id ?? UNLABELED_FILTER_ID;
}

/** Whether an event survives the calendar's hide-toggles, one per label. */
export function isEventVisible(event: FilterableEvent, hidden: Set<string>): boolean {
  return !hidden.has(filterKey(event));
}

/**
 * Labels in their given order, keeping only those some event uses, plus
 * whether any event is unlabeled. A label nothing is filed under yet would be
 * a toggle that does nothing.
 */
export function usedLabels<T extends { id: string }>(
  events: FilterableEvent[],
  labels: T[]
): { labels: T[]; hasUnlabeled: boolean } {
  const usedIds = new Set(events.map(filterKey));
  return {
    labels: labels.filter((label) => usedIds.has(label.id)),
    hasUnlabeled: usedIds.has(UNLABELED_FILTER_ID),
  };
}
