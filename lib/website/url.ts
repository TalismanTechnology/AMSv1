// URL canonicalization and crawl filtering for website sources. Pure functions
// only — everything here is unit-tested in url.test.ts.

/** The site a crawl is confined to, resolved from the root URL's redirects. */
export interface Site {
  /** e.g. "https://www.example.org" — scheme + host the root landed on. */
  origin: string;
}

// Query parameters that only track a click. Dropping them makes the same page
// reached from a newsletter and from the nav one URL instead of two.
const TRACKING_PARAMS = new Set([
  "gclid",
  "dclid",
  "fbclid",
  "msclkid",
  "yclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "_ga",
  "_gl",
  "_hsenc",
  "_hsmi",
  "hsctatracking",
  "ref_src",
  "jsessionid",
  "phpsessid",
  "sid",
]);

function isTrackingParam(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.startsWith("utm_") || TRACKING_PARAMS.has(lower);
}

/** "www.example.org" and "example.org" are the same site. */
export function hostKey(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}

/**
 * Canonical form of a URL: http(s) only, no fragment, no tracking params,
 * sorted query, no default port, no `;jsessionid=` path params, no trailing
 * slash (except the root "/"). Returns null for anything we can't crawl.
 */
export function normalizeUrl(raw: string, base?: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim(), base);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;

  url.hash = "";
  url.hostname = url.hostname.toLowerCase().replace(/\.$/, "");

  let path = url.pathname.replace(/;jsessionid=[^/?]*/gi, "").replace(/\/{2,}/g, "/");
  if (path.length > 1 && path.endsWith("/")) path = path.replace(/\/+$/, "");
  url.pathname = path || "/";

  const kept = [...url.searchParams.entries()]
    .filter(([name]) => !isTrackingParam(name))
    .sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)));
  url.search = "";
  for (const [name, value] of kept) url.searchParams.append(name, value);

  return url.toString();
}

/**
 * Normalize, and if the URL is on the site (same host, or its www/apex twin)
 * rewrite it onto the site's canonical scheme + host. Off-site → null.
 */
export function toSiteUrl(raw: string, site: Site, base?: string): string | null {
  const normalized = normalizeUrl(raw, base);
  if (!normalized) return null;
  const url = new URL(normalized);
  const origin = new URL(site.origin);
  if (hostKey(url.hostname) !== hostKey(origin.hostname)) return null;
  // A different explicit port is a different server.
  if (url.port && url.port !== origin.port) return null;
  url.protocol = origin.protocol;
  url.hostname = origin.hostname;
  url.port = origin.port;
  return url.toString();
}

// File extensions we never fetch. PDFs are the one binary type ingested.
const SKIPPED_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico", "tif", "tiff", "heic",
  "mp4", "mov", "avi", "wmv", "webm", "mkv", "m4v",
  "mp3", "wav", "m4a", "ogg", "aac", "flac",
  "zip", "gz", "tgz", "rar", "7z", "tar", "dmg", "exe", "msi", "apk", "iso",
  "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "rtf", "csv",
  "css", "js", "mjs", "json", "xml", "rss", "atom", "ics", "vcf",
  "woff", "woff2", "ttf", "otf", "eot",
]);

export function extensionOf(url: string): string | null {
  const { pathname } = new URL(url);
  const last = pathname.split("/").pop() ?? "";
  const dot = last.lastIndexOf(".");
  return dot > 0 ? last.slice(dot + 1).toLowerCase() : null;
}

export function looksLikePdf(url: string): boolean {
  return extensionOf(url) === "pdf";
}

// Pages that are never worth indexing for parents' questions, or that are
// infinite crawler traps. Matched against the lowercased path + query.
const DEFAULT_EXCLUDES: RegExp[] = [
  // Sign-in, accounts, portals, carts
  /(^|\/)(log-?in|log-?on|sign-?in|sign-?up|log-?out|sign-?out|register|portal|portals|my-?account|account|accounts|user|users|profile|password|cart|checkout)(\/|$|\?|\.)/,
  /\/(wp-admin|wp-login\.php|wp-json|xmlrpc\.php|cgi-bin|admin)(\/|$|\?)/,
  // Site search
  /(^|\/)search(\/|$|\?|\.)/,
  /[?&](s|q|query|search|keywords?)=/,
  // Feeds, print views, calendar exports
  /(^|\/)(feed|feeds|rss|atom)(\/|$|\?)/,
  /[?&](feed|format|output|print|view)=(rss|atom|ical|ics|print|printable|pdf)/,
  /[?&](print|printable)(=|&|$)/,
  /(^|\/)print(\/|$|\?)/,
  /(^|\/)(ical|icalendar|webcal)(\/|$|\?)/,
  /\/calendar[^?]*\?/, // month/week navigation on calendars is an infinite trap
  /[?&](ical|outlook-ical|tribe-bar-date|eventdisplay|calendar_?date|date|month|year|week)=/,
  // Tag / author / category archives and pagination
  /(^|\/)(tag|tags|author|authors|category|categories|archive|archives)\//,
  /(^|\/)page\/\d+(\/|$)/,
  /[?&](page|paged|pg|start|offset)=\d+/,
  /[?&](sort|order|orderby|filter|replytocom|share|action)=/,
];

export function isDefaultExcluded(url: string): boolean {
  const u = new URL(url);
  const target = (u.pathname + u.search).toLowerCase();
  return DEFAULT_EXCLUDES.some((re) => re.test(target));
}

/**
 * Compile an admin-entered pattern. A pattern is a prefix with optional `*`
 * wildcards: "/admissions" matches "/admissions/apply"; "*\/news/*" matches
 * any path containing "/news/". Patterns starting with "http" match the full
 * URL; anything else matches path + query.
 */
export function compilePattern(pattern: string): { full: boolean; re: RegExp } | null {
  const trimmed = pattern.trim();
  if (!trimmed) return null;
  const full = /^https?:\/\//i.test(trimmed);
  const body = full || trimmed.startsWith("/") || trimmed.startsWith("*") ? trimmed : `/${trimmed}`;
  const escaped = body
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return { full, re: new RegExp(`^${escaped}`, "i") };
}

export function matchesPattern(url: string, pattern: string): boolean {
  const compiled = compilePattern(pattern);
  if (!compiled) return false;
  const u = new URL(url);
  return compiled.re.test(compiled.full ? url : u.pathname + u.search);
}

export interface FilterOptions {
  include: string[];
  exclude: string[];
}

export type FilterVerdict =
  | { allowed: true }
  | { allowed: false; reason: "binary" | "default_exclude" | "excluded" | "not_included" };

/**
 * Should this (already site-normalized) URL be crawled? Admin include
 * patterns, when present, must match; admin excludes and the built-in
 * exclusions always apply.
 */
export function filterUrl(url: string, options: FilterOptions): FilterVerdict {
  const ext = extensionOf(url);
  if (ext && ext !== "pdf" && SKIPPED_EXTENSIONS.has(ext)) {
    return { allowed: false, reason: "binary" };
  }
  if (options.exclude.some((p) => matchesPattern(url, p))) {
    return { allowed: false, reason: "excluded" };
  }
  if (isDefaultExcluded(url)) return { allowed: false, reason: "default_exclude" };
  const include = options.include.filter((p) => p.trim());
  if (include.length && !include.some((p) => matchesPattern(url, p))) {
    return { allowed: false, reason: "not_included" };
  }
  return { allowed: true };
}

/** Split a textarea (one pattern per line) into a clean list. */
export function parsePatternList(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    ),
  ].slice(0, 100);
}
