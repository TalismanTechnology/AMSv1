import { gunzipSync } from "node:zlib";

export interface ParsedSitemap {
  /** Child sitemaps listed by a <sitemapindex>. */
  sitemaps: string[];
  /** Page URLs listed by a <urlset>. */
  urls: string[];
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

/** Sitemaps are sometimes served gzipped without a Content-Encoding header. */
export function sitemapBodyToText(body: Buffer): string {
  if (body.length > 2 && body[0] === 0x1f && body[1] === 0x8b) {
    return gunzipSync(body).toString("utf8");
  }
  return body.toString("utf8");
}

/**
 * Pull <loc> entries out of a sitemap or sitemap index. A regex rather than an
 * XML parser: sitemaps are flat, often slightly malformed, and we only need
 * the locations.
 */
export function parseSitemap(xml: string): ParsedSitemap {
  const isIndex = /<sitemapindex[\s>]/i.test(xml);
  const locs = [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)]
    .map((m) => decodeXmlEntities(m[1]))
    .filter(Boolean);
  return isIndex ? { sitemaps: locs, urls: [] } : { sitemaps: [], urls: locs };
}
