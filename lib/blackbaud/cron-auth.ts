import crypto from "node:crypto";

/**
 * Authorize a scheduled job request against CRON_SECRET.
 *
 * Prefer the Authorization header: query strings land in access logs and proxy
 * logs, so a secret passed that way leaks to anyone who can read them. The
 * query form stays supported because some schedulers cannot set headers.
 *
 * The comparison is timing-safe, and the length check guards timingSafeEqual
 * itself — it throws on mismatched buffer lengths rather than returning false.
 */
export function isCronAuthorized(request: Request, secret: string): boolean {
  const header = request.headers.get("authorization");
  const presented = header?.startsWith("Bearer ")
    ? header.slice(7)
    : new URL(request.url).searchParams.get("key");

  if (!presented || presented.length !== secret.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(presented), Buffer.from(secret));
}
