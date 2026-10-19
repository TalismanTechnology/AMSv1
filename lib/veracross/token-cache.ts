// In-memory cache for Veracross client_credentials (Data API) tokens.
//
// Veracross allows at most 10 active tokens per OAuth Application, and
// creating an 11th silently revokes the oldest. Client-credentials tokens last
// an hour and can't be refreshed. Minting one per sign-in would, during a
// burst of sign-ins, keep revoking tokens other requests are still using.
//
// So: one cached token per (school route, client id, scope set), reused until
// shortly before it expires, with concurrent callers sharing one in-flight
// request. The cache is per warm server instance (serverless functions keep
// module state between invocations of the same instance), which keeps token
// creation far below the cap: roughly one per instance per hour.
//
// Authorization-code (per-user) tokens are not cached: Veracross counts them
// per user, and each is used once to read userinfo, then dropped.
//
// Source: https://api-docs.veracross.com/docs/docs/097f6c769cafb-access-tokens

const MAX_TTL_SECONDS = 55 * 60;
const EXPIRY_MARGIN_SECONDS = 5 * 60;

export interface ClientTokenKey {
  schoolRoute: string;
  clientId: string;
  scopes: readonly string[];
}

export interface MintedClientToken {
  accessToken: string;
  expiresIn: number | null | undefined;
}

interface Entry {
  schoolRoute: string;
  clientId: string;
  token: string;
  expiresAt: number;
}

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<string>>();
// Bumped on invalidation so a request already in flight doesn't re-cache a
// token that was invalidated while it was being minted.
const generations = new Map<string, number>();
let now: () => number = () => Date.now();

export function clientTokenCacheKey(key: ClientTokenKey): string {
  return JSON.stringify([
    key.schoolRoute,
    key.clientId,
    Array.from(new Set(key.scopes)).sort(),
  ]);
}

/**
 * How long to reuse a token, in seconds: min(expires_in - 5 min, 55 min),
 * 55 min if Veracross didn't say. A token that lives under 10 minutes (not
 * expected) is reused for half its life.
 */
export function clientTokenTtlSeconds(expiresIn: number | null | undefined): number {
  if (typeof expiresIn !== "number" || !Number.isFinite(expiresIn)) return MAX_TTL_SECONDS;
  const ttl = Math.min(expiresIn - EXPIRY_MARGIN_SECONDS, MAX_TTL_SECONDS);
  if (expiresIn >= 2 * EXPIRY_MARGIN_SECONDS) return ttl;
  return Math.max(Math.floor(expiresIn / 2), 0);
}

/**
 * The cached token for `key`, or a new one from `mint`. Concurrent callers
 * for the same key share one `mint` call. Failures aren't cached.
 */
export async function getCachedClientToken(
  key: ClientTokenKey,
  mint: () => Promise<MintedClientToken>
): Promise<string> {
  const cacheKey = clientTokenCacheKey(key);

  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now()) return cached.token;
  if (cached) cache.delete(cacheKey);

  const pending = inflight.get(cacheKey);
  if (pending) return pending;

  const generation = generations.get(cacheKey) ?? 0;
  const request = (async () => {
    try {
      const minted = await mint();
      const ttl = clientTokenTtlSeconds(minted.expiresIn);
      if (ttl > 0 && (generations.get(cacheKey) ?? 0) === generation) {
        cache.set(cacheKey, {
          schoolRoute: key.schoolRoute,
          clientId: key.clientId,
          token: minted.accessToken,
          expiresAt: now() + ttl * 1000,
        });
      }
      return minted.accessToken;
    } finally {
      inflight.delete(cacheKey);
    }
  })();

  inflight.set(cacheKey, request);
  return request;
}

/**
 * Drops cached tokens: for one key, or for every scope set of an OAuth
 * Application (`{ schoolRoute, clientId }`, e.g. a VeracrossConnection).
 *
 * Pass `staleToken` (the token that was just rejected) to drop the entry only
 * if it still holds that token; if another request already replaced it, the
 * fresh token is kept rather than minting yet another.
 */
export function invalidateVeracrossClientToken(
  target: ClientTokenKey | { schoolRoute: string; clientId: string },
  staleToken?: string
): void {
  // A VeracrossConnection also has `scopes`, but as its sign-in scope string.
  const keys =
    "scopes" in target && Array.isArray(target.scopes)
      ? [clientTokenCacheKey(target as ClientTokenKey)]
      : Array.from(cache.entries())
          .filter(
            ([, entry]) =>
              entry.schoolRoute === target.schoolRoute && entry.clientId === target.clientId
          )
          .map(([cacheKey]) => cacheKey);

  for (const cacheKey of keys) {
    const entry = cache.get(cacheKey);
    // Nothing cached, or already replaced: whatever is in flight is fresh.
    if (staleToken !== undefined && entry?.token !== staleToken) continue;
    cache.delete(cacheKey);
    generations.set(cacheKey, (generations.get(cacheKey) ?? 0) + 1);
  }
}

/** Test-only: empty the cache and optionally swap the clock. */
export function resetVeracrossTokenCacheForTests(options: { now?: () => number } = {}): void {
  cache.clear();
  inflight.clear();
  generations.clear();
  now = options.now ?? (() => Date.now());
}
