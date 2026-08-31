import { getAccessToken } from "./oauth";

// Thin wrapper over the SKY API. Every request needs BOTH a bearer token
// (per-school) and the subscription key (global to our developer app).

const SKY_BASE_URL = "https://api.sky.blackbaud.com";

const MAX_RETRIES = 3;
const DEFAULT_BACKOFF_MS = 1000;

function getSubscriptionKey(): string {
  const key = process.env.BLACKBAUD_SUBSCRIPTION_KEY;

  if (!key) {
    throw new Error("BLACKBAUD_SUBSCRIPTION_KEY not configured");
  }

  return key;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface SkyFetchOptions {
  searchParams?: Record<string, string>;
}

/**
 * Perform an authenticated GET against the SKY API for a given school.
 *
 * Handles the two failure modes that matter in practice: a 401 (token went
 * stale between our expiry check and the request) is retried once with a
 * forced refresh, and a 429 is retried with backoff honouring Retry-After.
 */
export async function skyFetch<T>(
  schoolId: string,
  path: string,
  options: SkyFetchOptions = {}
): Promise<T> {
  const url = new URL(path.startsWith("/") ? path : `/${path}`, SKY_BASE_URL);

  for (const [key, value] of Object.entries(options.searchParams ?? {})) {
    url.searchParams.set(key, value);
  }

  let lastError = "";
  let forceRefresh = false;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const accessToken = await getAccessToken(schoolId, forceRefresh);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Bb-Api-Subscription-Key": getSubscriptionKey(),
        Accept: "application/json",
      },
    });

    if (response.ok) {
      return (await response.json()) as T;
    }

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("Retry-After"));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : DEFAULT_BACKOFF_MS * 2 ** attempt;

      lastError = `rate limited (429)`;
      await delay(waitMs);
      continue;
    }

    // Blackbaud rejected a token we still consider valid — it was revoked out
    // of band. Retrying with the cache would resend the same dead token, so
    // force a refresh. Once only; a second 401 is a real authorization problem.
    if (response.status === 401 && attempt === 0) {
      lastError = "unauthorized (401)";
      forceRefresh = true;
      continue;
    }

    const detail = await response.text();
    throw new Error(
      `SKY API ${url.pathname} failed (${response.status}): ${detail}`
    );
  }

  throw new Error(`SKY API ${url.pathname} failed after ${MAX_RETRIES} attempts: ${lastError}`);
}
