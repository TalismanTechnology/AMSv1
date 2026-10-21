// Code that ships before its migration is applied reads tables and columns
// that may not exist yet. Those errors mean "feature not installed", not
// "something broke": callers fall back to today's behaviour instead of
// failing.
//
//   42P01     Postgres: relation does not exist
//   42703     Postgres: column does not exist
//   42883     Postgres: function does not exist
//   PGRST202  PostgREST: function not in the schema cache
//   PGRST204  PostgREST: column not in the schema cache
//   PGRST205  PostgREST: table not in the schema cache

const NOT_INSTALLED_CODES = new Set(["42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"]);

export interface MaybeDbError {
  code?: string | null;
  message?: string | null;
}

export function isNotInstalledError(error: MaybeDbError | null | undefined): boolean {
  if (!error) return false;
  if (error.code && NOT_INSTALLED_CODES.has(error.code)) return true;
  // Some client paths surface only the message.
  return !error.code && /does not exist|could not find the (table|column|function)/i.test(error.message ?? "");
}
