// Shared server-side reads for Insights. PostgREST caps a response at 1000
// rows, so range reads page through until a short page comes back.

const PAGE_SIZE = 1000;

export async function fetchAllPages<T>(
  page: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  maxRows = 20_000
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < maxRows; from += PAGE_SIZE) {
    const { data, error } = await page(from, Math.min(from + PAGE_SIZE, maxRows) - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

/** Split a list for `.in(...)` filters so request URLs stay short. */
export function chunk<T>(items: T[], size = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function daysAgoISO(days: number, now = new Date()): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}
