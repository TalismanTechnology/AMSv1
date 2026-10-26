// Pairs a fresh parse of a feed with the occurrences already staged from it.
//
// Blackbaud mints a new UID for every event each time a feed is downloaded, so
// the UID can't say "this is the same event as last time". An occurrence is
// identified by its title and start instead. Two genuinely separate events
// sharing both (two sessions of one thing at one time) are told apart by their
// order within the feed.

export interface ParsedOccurrence {
  title: string;
  occurrenceStart: Date;
  contentHash: string;
}

export interface StagedOccurrence {
  id: string;
  title: string;
  occurrence_start: string;
  content_hash: string;
  status: string;
  last_seen_at: string;
}

export interface OccurrenceMatch<P> {
  /** Parsed occurrences that match a staged row byte for byte. */
  unchanged: Array<{ parsed: P; staged: StagedOccurrence }>;
  /** Parsed occurrences replacing a staged row whose content moved on. */
  changed: Array<{ parsed: P; staged: StagedOccurrence }>;
  /** Parsed occurrences with no staged row yet. */
  added: P[];
  /**
   * Staged rows that copy an occurrence matched above — leftovers from syncs
   * that couldn't recognise the same event under a new UID. Safe to remove
   * whatever their date.
   */
  duplicates: StagedOccurrence[];
}

function occurrenceKey(title: string, start: string | Date): string {
  return `${title.trim().toLowerCase()}\u0000${new Date(start).toISOString()}`;
}

// Prefer the row already on the calendar, then the most recently seen one, so
// the row an admin's earlier decisions hang off is the one kept.
function rank(a: StagedOccurrence, b: StagedOccurrence): number {
  const published = Number(b.status === "approved") - Number(a.status === "approved");
  return published || b.last_seen_at.localeCompare(a.last_seen_at);
}

export function matchOccurrences<P extends ParsedOccurrence>(
  parsed: P[],
  staged: StagedOccurrence[]
): OccurrenceMatch<P> {
  const queues = new Map<string, StagedOccurrence[]>();
  for (const row of staged) {
    const key = occurrenceKey(row.title, row.occurrence_start);
    queues.set(key, [...(queues.get(key) ?? []), row]);
  }
  for (const queue of queues.values()) queue.sort(rank);

  const result: OccurrenceMatch<P> = { unchanged: [], changed: [], added: [], duplicates: [] };
  const seenKeys = new Set<string>();

  for (const occurrence of parsed) {
    const key = occurrenceKey(occurrence.title, occurrence.occurrenceStart);
    seenKeys.add(key);
    const previous = queues.get(key)?.shift();

    if (!previous) {
      result.added.push(occurrence);
    } else if (
      previous.content_hash === occurrence.contentHash &&
      previous.status !== "superseded"
    ) {
      result.unchanged.push({ parsed: occurrence, staged: previous });
    } else {
      result.changed.push({ parsed: occurrence, staged: previous });
    }
  }

  // Rows left over under a key the feed still lists are copies. Rows under a
  // key the feed no longer lists are left for the cancellation sweep, which
  // only touches future dates.
  for (const [key, leftovers] of queues) {
    if (seenKeys.has(key)) {
      result.duplicates.push(...leftovers.filter((row) => row.status !== "superseded"));
    }
  }

  return result;
}
