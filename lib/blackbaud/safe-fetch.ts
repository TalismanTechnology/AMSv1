import dns from "node:dns/promises";
import net from "node:net";

// Fetching a URL a school admin typed is a server-side request to an arbitrary
// host. Without checks that is an SSRF primitive: an admin — or anyone who
// phishes one — could point a feed at 169.254.169.254 and have us fetch cloud
// instance credentials, or sweep the private network our server sits in and
// read the results back out of the sync error message.
//
// So every hop is validated: scheme, then the resolved IP, then again after
// each redirect (a public host can 302 to a private one).

const MAX_REDIRECTS = 5;
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB — a large school year of iCal
const TIMEOUT_MS = 20_000;

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

/**
 * Calendar subscription links are routinely handed out as `webcal://`, which
 * is not a scheme fetch understands. It is plain HTTPS underneath.
 */
export function normalizeFeedUrl(raw: string): string {
  const trimmed = raw.trim();
  if (/^webcal:\/\//i.test(trimmed)) {
    return trimmed.replace(/^webcal:\/\//i, "https://");
  }
  return trimmed;
}

function isBlockedIp(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 0) return true; // not an IP we can reason about

  if (version === 4) {
    const parts = ip.split(".").map(Number);
    const [a, b] = parts;

    if (a === 0) return true; // 0.0.0.0/8 "this network"
    if (a === 10) return true; // private
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 192 && b === 0) return true; // IETF protocol assignments
    if (a >= 224) return true; // multicast + reserved + broadcast
    return false;
  }

  const normalized = ip.toLowerCase().split("%")[0];

  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fe80")) return true; // link-local
  if (/^f[cd]/.test(normalized)) return true; // unique local fc00::/7

  // IPv4-mapped (::ffff:10.0.0.1) would otherwise sail past the checks above.
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIp(mapped[1]);

  return false;
}

async function assertPublicHost(url: URL): Promise<void> {
  if (url.protocol !== "https:") {
    throw new UnsafeUrlError(
      `Calendar feeds must use https (got ${url.protocol.replace(":", "") || "no scheme"}).`
    );
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "");

  // A literal IP never needs resolving, and passing one to dns.lookup would
  // just echo it back.
  if (net.isIP(hostname) !== 0) {
    if (isBlockedIp(hostname)) {
      throw new UnsafeUrlError(`Feed host ${hostname} is not a public address.`);
    }
    return;
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await dns.lookup(hostname, { all: true });
  } catch {
    throw new UnsafeUrlError(`Could not resolve feed host ${hostname}.`);
  }

  if (addresses.length === 0) {
    throw new UnsafeUrlError(`Could not resolve feed host ${hostname}.`);
  }

  // Every A/AAAA record must be public. A hostname that resolves to one public
  // and one private address would otherwise be a coin flip.
  for (const { address } of addresses) {
    if (isBlockedIp(address)) {
      throw new UnsafeUrlError(
        `Feed host ${hostname} resolves to a non-public address.`
      );
    }
  }
}

/**
 * Fetch a calendar feed over HTTPS with SSRF, size, and time limits.
 *
 * Redirects are followed manually so each hop can be re-validated — `fetch`'s
 * automatic following would happily land on a private address.
 */
export async function fetchFeedText(rawUrl: string): Promise<string> {
  let current = new URL(normalizeFeedUrl(rawUrl));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await assertPublicHost(current);

      const response = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "text/calendar, text/plain;q=0.9, */*;q=0.8",
          "User-Agent": "AskMySchool calendar sync",
        },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          throw new Error(`Feed redirected (${response.status}) without a location.`);
        }
        current = new URL(location, current);
        continue;
      }

      if (!response.ok) {
        throw new Error(`Feed request failed (${response.status}).`);
      }

      return await readCapped(response);
    }

    throw new Error(`Feed exceeded ${MAX_REDIRECTS} redirects.`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Read the body but stop at MAX_BYTES. Content-Length is advisory — a hostile
 * or misconfigured server can stream forever without one — so the running
 * total is what actually enforces the cap.
 */
async function readCapped(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    throw new Error("Feed is larger than the 10 MB limit.");
  }

  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    total += value.length;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new Error("Feed is larger than the 10 MB limit.");
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks).toString("utf8");
}

// Exported for tests.
export const __testing = { isBlockedIp, assertPublicHost };
