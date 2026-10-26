import type { PostgrestError } from "@supabase/supabase-js";

// PostgREST caps every response (1,000 rows by default) and says nothing when
// it truncates. Anything that must see every row pages through with this.
const PAGE_SIZE = 1000;

/**
 * Run a query page by page until it runs dry. `page` receives an inclusive
 * row range to pass to `.range(from, to)`, and should order by a unique column
 * so pages don't overlap or skip.
 */
export async function selectAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}
