import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import {
  filterUrl,
  matchesPattern,
  normalizeUrl,
  parsePatternList,
  toSiteUrl,
} from "./url";
import { crawlDelayMs, isAllowedByRobots, parseRobots } from "./robots";
import { parseSitemap, sitemapBodyToText } from "./sitemap";
import { pdfTitleFromUrl, websiteFileName, websiteStorageKey } from "./documents";

const site = { origin: "https://www.example.org" };
const noPatterns = { include: [], exclude: [] };

// ── Normalization ────────────────────────────────────────────────────────────

test("strips fragments, tracking params and trailing slashes; sorts the query", () => {
  assert.equal(
    normalizeUrl("https://Example.org/About/?utm_source=news&b=2&fbclid=x&a=1#staff"),
    "https://example.org/About?a=1&b=2"
  );
  assert.equal(normalizeUrl("https://example.org/"), "https://example.org/");
  assert.equal(normalizeUrl("https://example.org"), "https://example.org/");
  assert.equal(normalizeUrl("https://example.org:443/a//b/"), "https://example.org/a/b");
  assert.equal(normalizeUrl("https://example.org/a;jsessionid=ABC123"), "https://example.org/a");
});

test("resolves relative links and rejects non-http schemes", () => {
  assert.equal(normalizeUrl("../calendar", "https://example.org/about/staff"), "https://example.org/calendar");
  assert.equal(normalizeUrl("mailto:office@example.org"), null);
  assert.equal(normalizeUrl("javascript:void(0)"), null);
  assert.equal(normalizeUrl("tel:5551234"), null);
});

test("www and apex are one site, mapped onto the canonical host and scheme", () => {
  assert.equal(toSiteUrl("http://example.org/news/", site), "https://www.example.org/news");
  assert.equal(toSiteUrl("/news", site, "https://www.example.org/"), "https://www.example.org/news");
  assert.equal(toSiteUrl("https://blog.example.org/x", site), null);
  assert.equal(toSiteUrl("https://other.org/x", site), null);
  assert.equal(toSiteUrl("https://www.example.org:8443/x", site), null);
});

// ── Filtering ────────────────────────────────────────────────────────────────

test("skips binaries except PDFs", () => {
  assert.deepEqual(filterUrl("https://www.example.org/forms/handbook.pdf", noPatterns), { allowed: true });
  assert.equal(filterUrl("https://www.example.org/img/logo.png", noPatterns).allowed, false);
  assert.equal(filterUrl("https://www.example.org/forms/form.docx", noPatterns).allowed, false);
  assert.equal(filterUrl("https://www.example.org/media/tour.mp4", noPatterns).allowed, false);
});

test("default exclusions: login, portals, search, feeds, print, calendars, archives, pagination", () => {
  const excluded = [
    "https://www.example.org/login",
    "https://www.example.org/parent-portal/portal",
    "https://www.example.org/account/settings",
    "https://www.example.org/search?q=lunch",
    "https://www.example.org/?s=lunch",
    "https://www.example.org/news/feed",
    "https://www.example.org/calendar?month=2026-10",
    "https://www.example.org/events?ical=1",
    "https://www.example.org/page?print=1",
    "https://www.example.org/news/tag/sports",
    "https://www.example.org/news/category/athletics/",
    "https://www.example.org/news/page/3",
    "https://www.example.org/news?page=2",
    "https://www.example.org/wp-admin/edit.php",
  ];
  for (const url of excluded) {
    const normalized = normalizeUrl(url)!;
    assert.equal(filterUrl(normalized, noPatterns).allowed, false, `${url} should be excluded`);
  }

  const allowed = [
    "https://www.example.org/",
    "https://www.example.org/admissions/tuition",
    "https://www.example.org/about/administration",
    "https://www.example.org/calendar",
    "https://www.example.org/index.php?page=about",
    "https://www.example.org/accounts-payable-policy",
  ];
  for (const url of allowed) {
    assert.equal(filterUrl(normalizeUrl(url)!, noPatterns).allowed, true, `${url} should be allowed`);
  }
});

test("include/exclude patterns: prefixes and * globs", () => {
  assert.equal(matchesPattern("https://www.example.org/admissions/apply", "/admissions"), true);
  assert.equal(matchesPattern("https://www.example.org/admissions/apply", "admissions"), true);
  assert.equal(matchesPattern("https://www.example.org/about", "/admissions"), false);
  assert.equal(matchesPattern("https://www.example.org/upper/handbook-2026", "*/handbook*"), true);
  assert.equal(matchesPattern("https://www.example.org/news/x", "https://www.example.org/news"), true);

  const options = { include: ["/admissions", "/about"], exclude: ["/about/history"] };
  assert.equal(filterUrl("https://www.example.org/admissions/tuition", options).allowed, true);
  assert.deepEqual(filterUrl("https://www.example.org/athletics", options), { allowed: false, reason: "not_included" });
  assert.deepEqual(filterUrl("https://www.example.org/about/history", options), { allowed: false, reason: "excluded" });
});

test("pattern lists: one per line, trimmed, deduped", () => {
  assert.deepEqual(parsePatternList(" /a \n\n/b\r\n/a\n"), ["/a", "/b"]);
});

// ── robots.txt ───────────────────────────────────────────────────────────────

const ROBOTS = `
# comment
User-agent: Googlebot
Disallow: /

User-agent: *
Disallow: /private/
Disallow: /*.php$
Allow: /private/public-info
Crawl-delay: 5

Sitemap: https://www.example.org/sitemap_index.xml
`;

test("robots: uses the * group, longest match wins, Allow wins ties, $ anchors", () => {
  const robots = parseRobots(ROBOTS);
  assert.equal(isAllowedByRobots(robots, "https://www.example.org/about"), true);
  assert.equal(isAllowedByRobots(robots, "https://www.example.org/private/staff"), false);
  assert.equal(isAllowedByRobots(robots, "https://www.example.org/private/public-info"), true);
  assert.equal(isAllowedByRobots(robots, "https://www.example.org/index.php"), false);
  assert.equal(isAllowedByRobots(robots, "https://www.example.org/index.php?x=1"), true);
  assert.deepEqual(robots.sitemaps, ["https://www.example.org/sitemap_index.xml"]);
});

test("robots: a group naming our bot overrides *", () => {
  const robots = parseRobots(`User-agent: *\nDisallow: /\n\nUser-agent: AskMySchoolBot\nDisallow: /staff\n`);
  assert.equal(isAllowedByRobots(robots, "https://www.example.org/about"), true);
  assert.equal(isAllowedByRobots(robots, "https://www.example.org/staff/list"), false);
});

test("robots: agents listed together share rules; empty Disallow allows all", () => {
  const robots = parseRobots(`User-agent: foo\nUser-agent: *\nDisallow:\n`);
  assert.equal(isAllowedByRobots(robots, "https://www.example.org/anything"), true);
  assert.equal(isAllowedByRobots(parseRobots(""), "https://www.example.org/x"), true);
});

test("crawl delay is max(robots Crawl-delay, 1s), capped", () => {
  assert.equal(crawlDelayMs(parseRobots(ROBOTS)), 5000);
  assert.equal(crawlDelayMs(parseRobots("User-agent: *\nCrawl-delay: 0.2")), 1000);
  assert.equal(crawlDelayMs(parseRobots("")), 1000);
  assert.equal(crawlDelayMs(parseRobots("User-agent: *\nCrawl-delay: 600")), 60_000);
});

// ── Sitemaps ─────────────────────────────────────────────────────────────────

test("parses sitemap indexes and url sets, including gzipped bodies", () => {
  const index = `<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <sitemap><loc>https://www.example.org/page-sitemap.xml</loc></sitemap>
    <sitemap><loc> https://www.example.org/post-sitemap.xml </loc></sitemap></sitemapindex>`;
  assert.deepEqual(parseSitemap(index), {
    sitemaps: ["https://www.example.org/page-sitemap.xml", "https://www.example.org/post-sitemap.xml"],
    urls: [],
  });

  const urlset = `<urlset><url><loc>https://www.example.org/a?x=1&amp;y=2</loc></url>
    <url><loc><![CDATA[https://www.example.org/b]]></loc></url></urlset>`;
  assert.deepEqual(parseSitemap(sitemapBodyToText(gzipSync(urlset))), {
    sitemaps: [],
    urls: ["https://www.example.org/a?x=1&y=2", "https://www.example.org/b"],
  });
});

// ── Storage naming ───────────────────────────────────────────────────────────

test("storage keys are stable per URL and scoped to school/website/source", () => {
  const a = websiteStorageKey("school-1", "src-1", "https://www.example.org/a", "html");
  assert.equal(a, websiteStorageKey("school-1", "src-1", "https://www.example.org/a", "html"));
  assert.match(a, /^school-1\/website\/src-1\/[0-9a-f]{40}\.txt$/);
  assert.match(websiteStorageKey("school-1", "src-1", "https://www.example.org/f.pdf", "pdf"), /\.pdf$/);
  assert.equal(websiteFileName("https://www.example.org/admissions/tuition/", "html"), "www.example.org-admissions-tuition.txt");
  assert.equal(pdfTitleFromUrl("https://www.example.org/files/2026-Bus_Routes%20Fall.pdf"), "2026 Bus Routes Fall");
});
