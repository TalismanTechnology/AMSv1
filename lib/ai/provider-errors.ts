// AI provider (Gemini) failures, sorted into a few categories so that nobody
// outside the server logs sees the provider's own words. Parents get one
// friendly sentence whatever went wrong; admins get a slightly more useful
// line per category; the raw text goes to console.error and the owner alert
// (lib/alerts/ai-failure-alert.ts) only.
//
// Pure (no I/O, no server-only imports): the chat client imports the parent
// message from here.

export type AiErrorCategory =
  /** Prepaid credits used up, billing problem, or quota exhausted. */
  | "billing_quota"
  /** 429 / RESOURCE_EXHAUSTED that isn't a billing quota. */
  | "rate_limit"
  /** 5xx: the provider is down or overloaded. */
  | "provider_unavailable"
  /** Missing, invalid or revoked API key; 401/403. */
  | "auth"
  /** The request never got an HTTP answer (DNS, reset, timeout). */
  | "network"
  | "unknown";

export const AI_ERROR_CATEGORIES: readonly AiErrorCategory[] = [
  "billing_quota",
  "rate_limit",
  "provider_unavailable",
  "auth",
  "network",
  "unknown",
];

/** Everything a parent is ever shown when the assistant can't answer. */
export const PARENT_AI_ERROR_MESSAGE =
  "Ask My School is temporarily unavailable. Please try again in a little while.";

const ADMIN_MESSAGES: Record<AiErrorCategory, string> = {
  billing_quota:
    "The AI service is unavailable: its usage limit has been reached. The AskMySchool team has been alerted.",
  rate_limit: "The AI service is busy right now. Try again in a minute.",
  provider_unavailable: "The AI service is having problems right now. Try again shortly.",
  auth: "The AI service refused our credentials. The AskMySchool team has been alerted.",
  network: "Couldn't reach the AI service. Try again shortly.",
  unknown: "The AI service failed unexpectedly. Try again shortly.",
};

/** A short, provider-free explanation for school admins. */
export function adminAiErrorMessage(category: AiErrorCategory): string {
  return ADMIN_MESSAGES[category];
}

interface ErrorLike {
  name?: unknown;
  message?: unknown;
  statusCode?: unknown;
  status?: unknown;
  code?: unknown;
  responseBody?: unknown;
  lastError?: unknown;
  errors?: unknown;
  cause?: unknown;
}

/**
 * The error and everything it wraps: the AI SDK's RetryError keeps the real
 * failure in lastError/errors, and fetch puts the socket error in cause.
 */
function errorChain(error: unknown): ErrorLike[] {
  const chain: ErrorLike[] = [];
  const seen = new Set<unknown>();
  const queue: unknown[] = [error];
  while (queue.length > 0 && chain.length < 20) {
    const current = queue.shift();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);
    const e = current as ErrorLike;
    chain.push(e);
    if (e.lastError) queue.push(e.lastError);
    if (Array.isArray(e.errors)) queue.push(...e.errors.slice(-3));
    if (e.cause) queue.push(e.cause);
  }
  return chain;
}

function statusOf(e: ErrorLike): number | undefined {
  const status = typeof e.statusCode === "number" ? e.statusCode : e.status;
  return typeof status === "number" ? status : undefined;
}

function textOf(e: ErrorLike): string {
  return [e.name, e.message, e.code, e.responseBody]
    .filter((v): v is string => typeof v === "string")
    .join(" ");
}

const AI_SDK_ERROR_NAMES =
  /^AI_(APICallError|RetryError|LoadAPIKeyError|InvalidResponseDataError|EmptyResponseBodyError)$/;

const BILLING =
  /prepayment credits|credits? (are |is )?(depleted|exhausted)|billing|insufficient (funds|quota|balance)|exceeded your current quota|quota exceeded|payment required/i;
const RATE_LIMIT = /RESOURCE_EXHAUSTED|rate.?limit|too many requests/i;
const AUTH =
  /API_KEY_INVALID|api key (not valid|is invalid|expired)|invalid api key|PERMISSION_DENIED|unauthori[sz]ed|LoadAPIKeyError|API key is missing/i;
const UNAVAILABLE = /UNAVAILABLE|overloaded|INTERNAL|DEADLINE_EXCEEDED|service unavailable|bad gateway/;
const NETWORK =
  /fetch failed|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|UND_ERR_|socket hang up|network ?error|TimeoutError|timed? ?out/i;

/** Sort any thrown value into a category. Never throws. */
export function classifyAiError(error: unknown): AiErrorCategory {
  try {
    const chain = errorChain(error);
    const text =
      chain.map(textOf).join(" ") || (typeof error === "string" ? error : "");
    const statuses = chain.map(statusOf).filter((s): s is number => s !== undefined);

    // Billing first: Gemini reports depleted credits as a 429.
    if (statuses.includes(402) || BILLING.test(text)) return "billing_quota";
    if (statuses.includes(401) || statuses.includes(403) || AUTH.test(text)) return "auth";
    if (statuses.includes(429) || RATE_LIMIT.test(text)) return "rate_limit";
    if (statuses.some((s) => s >= 500) || UNAVAILABLE.test(text)) return "provider_unavailable";
    if (NETWORK.test(text)) return "network";
    return "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Whether this looks like a failure of the AI provider (as opposed to, say,
 * a database error that happened in the same request). Only these alert.
 */
export function isAiProviderError(error: unknown): boolean {
  try {
    const chain = errorChain(error);
    // Our own abort or timeout (e.g. the contact classifier's time limit)
    // is a choice we made, not the provider failing.
    if (chain.some((e) => e.name === "AbortError" || e.name === "TimeoutError")) return false;
    if (chain.some((e) => typeof e.name === "string" && AI_SDK_ERROR_NAMES.test(e.name))) {
      return true;
    }
    return classifyAiError(error) !== "unknown";
  } catch {
    return false;
  }
}

/** The provider's own message, for logs and the owner alert only. */
export function rawAiErrorMessage(error: unknown): string {
  try {
    const chain = errorChain(error);
    const parts: string[] = [];
    for (const e of chain) {
      const status = statusOf(e);
      const message = typeof e.message === "string" ? e.message : "";
      if (message || status) parts.push(status ? `[${status}] ${message}` : message);
    }
    const unique = [...new Set(parts)].join(" ← ");
    const fallback = typeof error === "string" ? error : String(error);
    return (unique || fallback).slice(0, 4000);
  } catch {
    return "unreadable error";
  }
}

/**
 * A stored error message (e.g. documents.error_message, written before this
 * module existed) made safe to show an admin.
 */
export function adminSafeStoredError(message: string | null | undefined): string | null {
  if (!message) return null;
  return isAiProviderError(message) ? adminAiErrorMessage(classifyAiError(message)) : message;
}
