import dns from "node:dns/promises";
import net from "node:net";
import { isBlockedIp } from "@/lib/blackbaud/safe-fetch";
import { USER_AGENT } from "./robots";

// Fetching URLs an admin typed (and every link those pages lead to) is a
// server-side request to arbitrary hosts, so — as with calendar feeds — every
// redirect hop is resolved and refused if it lands on a non-public address.
// Unlike feeds, plain http is allowed: plenty of school sites still serve it.

const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 20_000;

export const MAX_HTML_BYTES = 5 * 1024 * 1024;
export const MAX_PDF_BYTES = 15 * 1024 * 1024;

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

export class TooLargeError extends Error {
  constructor(limit: number) {
    super(`Response is larger than the ${Math.round(limit / 1024 / 1024)} MB limit.`);
    this.name = "TooLargeError";
  }
}

async function assertPublicHost(url: URL): Promise<void> {
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new UnsafeUrlError(`Unsupported scheme ${url.protocol}`);
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(hostname) !== 0) {
    if (isBlockedIp(hostname)) throw new UnsafeUrlError(`${hostname} is not a public address.`);
    return;
  }
  let addresses: Array<{ address: string }>;
  try {
    addresses = await dns.lookup(hostname, { all: true });
  } catch {
    throw new UnsafeUrlError(`Could not resolve ${hostname}.`);
  }
  if (!addresses.length || addresses.some(({ address }) => isBlockedIp(address))) {
    throw new UnsafeUrlError(`${hostname} resolves to a non-public address.`);
  }
}

export interface FetchResult {
  status: number;
  /** URL of the final hop, after redirects. */
  finalUrl: string;
  headers: Headers;
  /** Null for 304s, errors, and bodies we chose not to read. */
  body: Buffer | null;
}

export interface FetchOptions {
  headers?: Record<string, string>;
  /** Byte cap chosen from the response's content type. */
  maxBytes: (contentType: string) => number;
  /** Read the body only for these statuses (default: 2xx). */
  accept?: string;
}

/**
 * GET with manual, re-validated redirects, a timeout, and a byte cap enforced
 * on the stream (Content-Length is advisory). Non-2xx bodies aren't read.
 */
export async function politeFetch(rawUrl: string, options: FetchOptions): Promise<FetchResult> {
  let current = new URL(rawUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await assertPublicHost(current);

      const response = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: options.accept ?? "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.5",
          // Validators only make sense for the URL they were stored against.
          ...(hop === 0 ? options.headers : {}),
        },
      });

      if (response.status >= 300 && response.status < 400 && response.status !== 304) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location) {
          return { status: response.status, finalUrl: current.toString(), headers: response.headers, body: null };
        }
        current = new URL(location, current);
        continue;
      }

      if (response.status < 200 || response.status >= 300) {
        await response.body?.cancel();
        return { status: response.status, finalUrl: current.toString(), headers: response.headers, body: null };
      }

      const contentType = response.headers.get("content-type") ?? "";
      const cap = options.maxBytes(contentType);
      if (cap <= 0) {
        // A content type we don't ingest (an image behind an extensionless URL).
        await response.body?.cancel();
        return { status: response.status, finalUrl: current.toString(), headers: response.headers, body: null };
      }
      const body = await readCapped(response, cap);
      return { status: response.status, finalUrl: current.toString(), headers: response.headers, body };
    }
    throw new Error(`More than ${MAX_REDIRECTS} redirects.`);
  } finally {
    clearTimeout(timer);
  }
}

async function readCapped(response: Response, maxBytes: number): Promise<Buffer> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel();
    throw new TooLargeError(maxBytes);
  }
  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      throw new TooLargeError(maxBytes);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * Byte cap by content type for crawled pages: PDFs get the larger allowance,
 * HTML (or an unlabeled body) the normal one, anything else isn't read.
 */
export function capForContentType(contentType: string): number {
  if (isPdfContentType(contentType)) return MAX_PDF_BYTES;
  if (!contentType || isHtmlContentType(contentType) || /text\/plain/i.test(contentType)) {
    return MAX_HTML_BYTES;
  }
  return 0;
}

export function isHtmlContentType(contentType: string): boolean {
  return /text\/html|application\/xhtml\+xml/i.test(contentType);
}

export function isPdfContentType(contentType: string): boolean {
  return /application\/pdf/i.test(contentType);
}

/** Decode an HTML body using the charset from the header, else utf-8. */
export function decodeHtml(body: Buffer, contentType: string): string {
  const charset = /charset=([^;]+)/i.exec(contentType)?.[1]?.trim().toLowerCase();
  try {
    return new TextDecoder(charset || "utf-8").decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}
