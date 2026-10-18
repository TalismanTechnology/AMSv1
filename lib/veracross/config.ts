// Where Veracross lives. Production always talks to the real hosts; tests and
// staging can point at a mock with:
//
//   VERACROSS_ACCOUNTS_ORIGIN   OAuth (authorize, token, userinfo)
//   VERACROSS_API_ORIGIN        Data API v3
//
// Read on every call (not at module load) so tests can set them. A value must
// be an https URL, or http only for localhost / 127.0.0.1; anything else is
// ignored with a warning. With VERCEL_ENV=production overrides are ignored
// entirely, so a stray env var can't send parents' codes or the client secret
// anywhere but Veracross.

export const DEFAULT_VERACROSS_ACCOUNTS_ORIGIN = "https://accounts.veracross.com";
export const DEFAULT_VERACROSS_API_ORIGIN = "https://api.veracross.com";

type OriginEnv = "VERACROSS_ACCOUNTS_ORIGIN" | "VERACROSS_API_ORIGIN";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

// Warn once per process per distinct problem, not on every request.
const warned = new Set<string>();

function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[veracross] ${message}`);
}

/** The override as a base URL without trailing slash, or null if unusable. */
export function parseOriginOverride(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }

  const secure = url.protocol === "https:";
  const local = url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname);
  if (!secure && !local) return null;
  if (url.username || url.password || url.search || url.hash) return null;

  return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
}

function resolveOrigin(name: OriginEnv, fallback: string): string {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;

  if (process.env.VERCEL_ENV === "production") {
    warnOnce(`${name}:production`, `${name} is ignored in production; using ${fallback}`);
    return fallback;
  }

  const parsed = parseOriginOverride(raw);
  if (!parsed) {
    warnOnce(
      `${name}:invalid:${raw}`,
      `${name} must be an https URL (http only for localhost); using ${fallback}`
    );
    return fallback;
  }

  return parsed;
}

export function veracrossAccountsOrigin(): string {
  return resolveOrigin("VERACROSS_ACCOUNTS_ORIGIN", DEFAULT_VERACROSS_ACCOUNTS_ORIGIN);
}

export function veracrossApiOrigin(): string {
  return resolveOrigin("VERACROSS_API_ORIGIN", DEFAULT_VERACROSS_API_ORIGIN);
}

/** Test-only: forget which warnings were already printed. */
export function resetVeracrossConfigWarningsForTests(): void {
  warned.clear();
}
