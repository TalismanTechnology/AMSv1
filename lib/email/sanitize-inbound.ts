import { parseHTML } from "linkedom";
import { parseEmailAddress } from "@/lib/email/inbound";
import type { InboundContent } from "@/lib/email/inbound-content";

// Mail read from a parent's own mailbox carries things that tie the stored
// copy to that parent: open-tracking pixels, per-recipient redirect links
// (eNotify's /c/ links log in as the recipient), unsubscribe and "view online"
// lines, and the recipient's own address. sanitizeInboundContent removes
// them before anything is stored; findForbiddenTokens is the backstop that
// refuses a message still naming the family.

const ENOTIFY_TRACKED = /myenotice\.com\/[cou]\//i;
const TRACKING_PARAM = /[?&](utm_|mc_eid|mkt_tok|_hsenc|_hsmi)/i;
const PREFERENCES = /unsubscribe|optout|opt-out|manage[-_ ]?preferences|email[-_ ]?preferences/i;
/** eNotify sends an HTML-only message whose text part is this placeholder. */
const PLACEHOLDER_TEXT = /^\s*<!--\s*placeholder\s*-->\s*$/i;

const SP = "(?:\\s|&#160;|&nbsp;| )+";
const UNSUBSCRIBE_LINE = new RegExp(
  [
    "You", "may", "unsubscribe", "if", "you", "no", "longer", "wish", "to",
    "receive", "e-?mails", "sent", "to", "this", "recipient", "list\\.?",
  ].join(SP),
  "gi"
);
const VIEW_ONLINE_HTML =
  /If you are having trouble viewing this email,?\s*(<[^>]+>\s*)*click here(\s*<\/[^>]+>)*\.?/gi;
const VIEW_ONLINE_TEXT = /If you are having trouble viewing this email,?\s*click here\.?/gi;

const lower = (s: string) => s.toLowerCase();

function isTrackedHref(href: string, recipients: string[]): boolean {
  const h = lower(href);
  return (
    ENOTIFY_TRACKED.test(href) ||
    PREFERENCES.test(href) ||
    TRACKING_PARAM.test(href) ||
    recipients.some((r) => h.includes(r))
  );
}

function removeAll(s: string, needles: string[]): string {
  let out = s;
  for (const n of needles) out = out.replace(new RegExp(escapeRegExp(n), "gi"), "");
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Strip pixels, tracked links (keeping their words), unsubscribe/view-online lines, recipients. */
export function sanitizeEmailHtml(html: string, recipients: string[]): string {
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  for (const img of Array.from(document.querySelectorAll("img"))) {
    const src = img.getAttribute("src") || "";
    const w = img.getAttribute("width");
    const h = img.getAttribute("height");
    if (
      (w === "1" && h === "1") ||
      /myenotice\.com\/o\//i.test(src) ||
      /\/(open|track|pixel)[./?]/i.test(src)
    ) {
      img.remove();
    }
  }
  for (const a of Array.from(document.querySelectorAll("a"))) {
    const href = a.getAttribute("href") || "";
    const text = (a.textContent || "").trim();
    if (/unsubscribe/i.test(text) || /unsubscribe/i.test(href)) {
      a.replaceWith(document.createTextNode(a.textContent || ""));
      continue;
    }
    if (isTrackedHref(href, recipients)) {
      // Keep the words, drop the per-recipient redirect.
      const span = document.createElement("span");
      span.innerHTML = a.innerHTML;
      a.replaceWith(span);
    }
  }
  for (const el of Array.from(document.querySelectorAll("script, form, iframe"))) el.remove();

  let out: string = document.body.innerHTML;
  // Outlook-only conditional blocks (VML buttons) carry their own tracked hrefs.
  out = out.replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, "");
  out = out.replace(/\s(?:href|src)=("|')[^"']*myenotice\.com\/[cou]\/[^"']*\1/gi, "");
  out = out.replace(VIEW_ONLINE_HTML, "");
  out = out.replace(UNSUBSCRIBE_LINE, "");
  return removeAll(out, recipients);
}

/** Readable text from HTML: block elements become line breaks, cells spaces. */
export function htmlToPlainText(html: string): string {
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  for (const el of Array.from(document.querySelectorAll("style, script, head, title"))) el.remove();
  for (const br of Array.from(document.querySelectorAll("br"))) {
    br.replaceWith(document.createTextNode("\n"));
  }
  for (const el of Array.from(
    document.querySelectorAll("p, div, tr, li, h1, h2, h3, h4, h5, h6, table, blockquote")
  )) {
    el.appendChild(document.createTextNode("\n"));
  }
  for (const td of Array.from(document.querySelectorAll("td, th"))) {
    td.appendChild(document.createTextNode(" "));
  }
  return (document.body.textContent || "")
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizeEmailText(text: string, recipients: string[]): string {
  return removeAll(
    text.replace(VIEW_ONLINE_TEXT, "").replace(UNSUBSCRIBE_LINE, ""),
    recipients
  )
    .replace(/<https?:\/\/[^>\s]*(myenotice\.com\/[cou]\/|unsubscribe)[^>\s]*>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * The bare addresses the mail was delivered to (To, Cc, Delivered-To), minus
 * the sender's own: these are what get scrubbed from the stored copy.
 */
export function recipientAddresses(content: InboundContent, deliveredTo: string[] = []): string[] {
  const sender = parseEmailAddress(content.from ?? "");
  const all = [...content.to, ...content.cc, ...deliveredTo]
    .map((a) => parseEmailAddress(a))
    .filter((a): a is string => !!a && a !== sender);
  return [...new Set(all.map(lower))];
}

/**
 * The content as it should be stored from a recipient's mailbox: sanitized
 * HTML, text taken from the text part (or the sanitized HTML when that is
 * missing or eNotify's placeholder) and cleaned the same way, and no To/Cc in
 * the saved headers.
 */
export function sanitizeInboundContent(
  content: InboundContent,
  recipients: string[]
): InboundContent {
  const html = content.html ? sanitizeEmailHtml(content.html, recipients) : null;
  const plain =
    content.text && !PLACEHOLDER_TEXT.test(content.text) ? content.text.trim() : "";
  const text = sanitizeEmailText(plain || (html ? htmlToPlainText(html) : ""), recipients);
  return { ...content, html, text: text || null, to: [], cc: [] };
}

/**
 * The tokens (case-insensitive substrings) found anywhere that would be
 * stored: subject, addresses, text, HTML, attachment names.
 */
export function findForbiddenTokens(content: InboundContent, tokens: string[]): string[] {
  const haystack = lower(
    [
      content.subject,
      content.from,
      ...content.to,
      ...content.cc,
      ...content.replyTo,
      content.text,
      content.html,
      ...content.attachments.map((a) => a.filename),
    ]
      .filter(Boolean)
      .join("\n")
  );
  return [...new Set(tokens.map((t) => t.trim()).filter(Boolean))].filter((t) =>
    haystack.includes(lower(t))
  );
}
