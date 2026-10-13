import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";
import { toSiteUrl, type Site } from "./url";

// Turn a fetched HTML page into the text parents' questions are answered
// from: the page's main content, without navigation, footers, scripts or
// cookie banners, plus its title, canonical URL and outgoing links.

export interface ExtractedPage {
  title: string;
  text: string;
  /** rel=canonical, site-normalized; null when absent or off-site. */
  canonicalUrl: string | null;
  /** Same-site links (site-normalized, deduped), minus rel=nofollow. */
  links: string[];
  /** <meta name="robots" content="noindex">: follow links, don't ingest. */
  noindex: boolean;
  /** <meta name="robots" content="nofollow">: ingest, don't follow links. */
  nofollow: boolean;
}

// Removed before anything else looks at the page. Readability already skips
// most chrome, but its fallback (and our own) would otherwise pick these up.
const CHROME_SELECTORS = [
  "script",
  "style",
  "noscript",
  "template",
  "iframe",
  "svg",
  "canvas",
  "form",
  "button",
  "select",
  "nav",
  "header",
  "footer",
  "aside",
  "[role=navigation]",
  "[role=banner]",
  "[role=contentinfo]",
  "[role=search]",
  "[aria-hidden=true]",
  "[hidden]",
  "[id*=cookie i]",
  "[class*=cookie i]",
  "[class*=skip-link i]",
  "[class*=breadcrumb i]",
].join(",");

const BLOCK_TAGS = new Set([
  "ADDRESS", "ARTICLE", "BLOCKQUOTE", "BR", "DD", "DIV", "DL", "DT", "FIGCAPTION",
  "FIGURE", "H1", "H2", "H3", "H4", "H5", "H6", "HR", "LI", "MAIN", "OL", "P",
  "PRE", "SECTION", "TABLE", "TBODY", "THEAD", "TFOOT", "TR", "UL",
]);

interface DomNode {
  nodeType: number;
  nodeName: string;
  textContent: string | null;
  childNodes: ArrayLike<DomNode>;
}

/**
 * Text with block structure kept: paragraphs and headings on their own lines,
 * list items bulleted, table cells tab-separated. textContent alone would run
 * every paragraph together, which hurts chunking.
 */
function blockText(root: DomNode): string {
  const out: string[] = [];

  const walk = (node: DomNode) => {
    if (node.nodeType === 3) {
      out.push((node.textContent ?? "").replace(/\s+/g, " "));
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = node.nodeName.toUpperCase();
    const block = BLOCK_TAGS.has(tag);
    if (block) out.push("\n");
    if (tag === "LI") out.push("- ");
    if (tag === "TD" || tag === "TH") out.push("\t");
    for (const child of Array.from(node.childNodes)) walk(child);
    if (block) out.push("\n");
  };
  walk(root);

  return out
    .join("")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanTitle(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
}

// Readability gives up on short pages (a contact page, a list of office hours)
// and returns very little. Below this its result is compared with our own.
const READABILITY_MIN_CHARS = 250;

export function extractPage(html: string, pageUrl: string, site: Site): ExtractedPage {
  const { document } = parseHTML(html);

  const robotsMeta = Array.from(document.querySelectorAll("meta[name]"))
    .filter((m) => /^(robots|askmyschoolbot)$/i.test(m.getAttribute("name") ?? ""))
    .map((m) => (m.getAttribute("content") ?? "").toLowerCase())
    .join(",");
  const noindex = /\b(noindex|none)\b/.test(robotsMeta);
  const nofollow = /\b(nofollow|none)\b/.test(robotsMeta);

  const canonicalHref = document.querySelector("link[rel~=canonical]")?.getAttribute("href");
  const canonicalUrl = canonicalHref ? toSiteUrl(canonicalHref, site, pageUrl) : null;

  const links = new Set<string>();
  if (!nofollow) {
    for (const a of Array.from(document.querySelectorAll("a[href]"))) {
      if (/\bnofollow\b/i.test(a.getAttribute("rel") ?? "")) continue;
      const href = toSiteUrl(a.getAttribute("href") ?? "", site, pageUrl);
      if (href) links.add(href);
    }
  }

  const headTitle = cleanTitle(
    document.querySelector("meta[property='og:title']")?.getAttribute("content") ||
      document.querySelector("title")?.textContent
  );

  for (const el of Array.from(document.querySelectorAll(CHROME_SELECTORS))) el.remove();

  // Our own fallback: the page's <main> (or role=main / #content), else body.
  const main =
    document.querySelector("main, [role=main], article, #content, #main, .main-content") ??
    document.body;
  const fallbackText = main ? blockText(main as unknown as DomNode) : "";
  const h1 = cleanTitle(document.querySelector("h1")?.textContent);

  let text = fallbackText;
  let readabilityTitle = "";
  try {
    // Readability mutates the document it is given; it runs last for that reason.
    const article = new Readability(document as unknown as Document, { charThreshold: 200 }).parse();
    if (article?.content) {
      readabilityTitle = cleanTitle(article.title);
      const { document: articleDoc } = parseHTML(`<html><body>${article.content}</body></html>`);
      const articleText = blockText(articleDoc.body as unknown as DomNode);
      // Prefer Readability unless it threw most of the page away on a short page.
      if (
        articleText.length >= READABILITY_MIN_CHARS ||
        articleText.length >= fallbackText.length * 0.6
      ) {
        text = articleText;
      }
    }
  } catch {
    // Malformed markup Readability can't handle — the fallback stands.
  }

  const title = headTitle || readabilityTitle || h1 || new URL(pageUrl).pathname;

  return { title, text, canonicalUrl, links: [...links], noindex, nofollow };
}
