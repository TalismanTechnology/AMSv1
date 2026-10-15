// Turn a document's plain text back into readable structure — headings,
// paragraphs, lists, tables — for the source viewer. The stored text of
// emails, web pages and .txt uploads keeps its line breaks but none of its
// formatting, so this reads the layout conventions people type by hand.
//
// Every block records [start, end) offsets into the text, so a cited passage
// located in the raw text maps onto the blocks that show it. For blocks with
// `text` and `textStart`, text[i] is raw[textStart + i] (newlines may have
// become spaces), so a highlight can be drawn on the exact characters.

export interface Span {
  start: number;
  end: number;
}

export interface InlineText extends Span {
  text: string;
  textStart: number;
}

export type Block =
  | ({ type: "heading"; level: 1 | 2 | 3 } & InlineText)
  | ({ type: "paragraph" } & InlineText)
  | ({ type: "list"; ordered: boolean; items: InlineText[] } & Span)
  | ({ type: "table"; rows: string[][]; header: boolean } & Span)
  | ({ type: "quote"; text: string } & Span)
  | ({ type: "hr" } & Span);

interface Line {
  text: string;
  start: number;
}

function splitLines(text: string): Line[] {
  const out: Line[] = [];
  let pos = 0;
  while (pos <= text.length) {
    const nl = text.indexOf("\n", pos);
    const end = nl === -1 ? text.length : nl;
    out.push({ text: text.slice(pos, end).replace(/\r$/, ""), start: pos });
    if (nl === -1) break;
    pos = nl + 1;
  }
  return out;
}

const isBlank = (l: Line | undefined) => !l || !l.text.trim();

const MD_HEADING = /^\s*(#{1,6})\s+(.+?)\s*#*\s*$/;
const HR = /^\s*([-*_=])(?:\s*\1){2,}\s*$/;
const LIST_ITEM = /^(\s*)([-*•·▪◦‣o]|\d{1,3}[.)]|[a-z][.)]|[A-Z]\))\s+(\S.*)$/;
const MD_TABLE_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$/;

type MarkerKind = "bullet" | "number" | "alpha";

function markerKind(marker: string): MarkerKind {
  if (/^\d/.test(marker)) return "number";
  if (/^[a-zA-Z][.)]$/.test(marker)) return "alpha";
  return "bullet";
}

function listItem(line: Line): { kind: MarkerKind; textOffset: number } | null {
  if (HR.test(line.text)) return null;
  const m = LIST_ITEM.exec(line.text);
  if (!m) return null;
  return {
    kind: markerKind(m[2]),
    textOffset: line.text.length - m[3].length,
  };
}

function isAllCaps(t: string): boolean {
  const letters = t.replace(/[^A-Za-z]/g, "");
  return letters.length >= 3 && !/[a-z]/.test(t) && t.length < 80;
}

function isUrlLine(t: string): boolean {
  return /^(?:https?:\/\/|www\.)\S+$/i.test(t);
}

function quoteLine(t: string): boolean {
  return t.trimStart().startsWith(">");
}

// Hard-wrapped prose wraps at ~70-80 columns, so a line this long was wrapped
// and joins the next; a shorter one ended where the author pressed return.
const WRAP_JOIN_MIN = 50;

/** Cells of a table row, or null when the line isn't one. */
function tableCells(t: string, mode: "pipe" | "tab" | "space"): string[] | null {
  const line = t.trim();
  if (!line) return null;
  if (mode === "pipe") {
    if (!line.includes("|")) return null;
    const cells = line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
    return cells.length >= 2 ? cells : null;
  }
  if (mode === "tab") {
    if (!t.includes("\t")) return null;
    const cells = line.split(/\t+/).map((c) => c.trim());
    return cells.length >= 2 ? cells : null;
  }
  const cells = line.split(/ {2,}/).map((c) => c.trim());
  return cells.length >= 2 ? cells : null;
}

function readTable(
  lines: Line[],
  i: number
): { rows: string[][]; header: boolean; next: number } | null {
  for (const mode of ["pipe", "tab", "space"] as const) {
    const first = tableCells(lines[i].text, mode);
    if (!first) continue;
    const rows: string[][] = [];
    let header = false;
    let j = i;
    for (; j < lines.length; j++) {
      const t = lines[j].text;
      if (mode === "pipe" && MD_TABLE_SEPARATOR.test(t) && t.includes("-")) {
        if (rows.length === 1) header = true;
        continue;
      }
      const cells = tableCells(t, mode);
      if (!cells) break;
      // Columns aligned with spaces only count when every row agrees.
      if (mode !== "pipe" && cells.length !== first.length) break;
      rows.push(cells);
    }
    if (rows.length < 2) continue;
    if (mode === "space") {
      // Two spaces after a full stop is a typing habit, not a column: only
      // short cells, and either 3+ columns or 3+ rows, read as a table.
      if (rows.some((r) => r.some((c) => c.length > 40))) continue;
      if (first.length < 3 && rows.length < 3) continue;
    }
    return { rows, header, next: j };
  }
  return null;
}

/** Start/end of a line's text with surrounding whitespace trimmed. */
function trimmedBounds(line: Line): [number, number] {
  const lead = line.text.length - line.text.trimStart().length;
  return [line.start + lead, line.start + line.text.trimEnd().length];
}

/**
 * Raw text from `start` to `end` with every newline either kept (a real line
 * break) or turned into a space (a soft wrap); tabs and CRs become spaces.
 * Same length as the slice, so offsets carry over unchanged.
 */
function inlineText(raw: string, start: number, end: number): string {
  const slice = raw.slice(start, end);
  let out = "";
  let lineStart = 0;
  for (let k = 0; k < slice.length; k++) {
    const c = slice[k];
    if (c === "\n") {
      const prevLine = slice.slice(lineStart, k).trim();
      out += prevLine.length >= WRAP_JOIN_MIN ? " " : "\n";
      lineStart = k + 1;
    } else if (c === "\r" || c === "\t") {
      out += " ";
    } else {
      out += c;
    }
  }
  return out;
}

function shift(block: Block, offset: number): Block {
  if (!offset) return block;
  const b = { ...block, start: block.start + offset, end: block.end + offset } as Block;
  if ("textStart" in b) b.textStart += offset;
  if (b.type === "list") {
    b.items = b.items.map((it) => ({
      ...it,
      start: it.start + offset,
      end: it.end + offset,
      textStart: it.textStart + offset,
    }));
  }
  return b;
}

/**
 * Parse plain text into display blocks. `offset` is added to every position,
 * for formatting a slice of a larger text in the larger text's coordinates.
 */
export function formatText(text: string, offset = 0): Block[] {
  const lines = splitLines(text);
  const blocks: Block[] = [];
  const n = lines.length;
  let i = 0;

  const startsBlock = (j: number): boolean => {
    const t = lines[j].text;
    return (
      MD_HEADING.test(t) ||
      HR.test(t) ||
      quoteLine(t) ||
      !!listItem(lines[j]) ||
      isAllCaps(t.trim())
    );
  };

  while (i < n) {
    const line = lines[i];
    const t = line.text;
    const trimmed = t.trim();
    if (!trimmed) {
      i++;
      continue;
    }

    const md = MD_HEADING.exec(t);
    if (md) {
      const textStart = line.start + t.indexOf(md[2], md[1].length);
      const level = md[1].length === 1 ? 1 : md[1].length === 2 ? 2 : 3;
      blocks.push({
        type: "heading",
        level,
        text: md[2],
        textStart,
        start: textStart,
        end: textStart + md[2].length,
      });
      i++;
      continue;
    }

    if (HR.test(t)) {
      const [s, e] = trimmedBounds(line);
      blocks.push({ type: "hr", start: s, end: e });
      i++;
      continue;
    }

    if (quoteLine(t)) {
      let j = i;
      while (j < n && quoteLine(lines[j].text)) j++;
      const quoted = lines.slice(i, j).map((l) => l.text.replace(/^\s*(?:>\s?)+/, ""));
      blocks.push({
        type: "quote",
        text: quoted.join("\n").trim(),
        start: trimmedBounds(line)[0],
        end: trimmedBounds(lines[j - 1])[1],
      });
      i = j;
      continue;
    }

    const first = listItem(line);
    if (first) {
      const items: InlineText[] = [];
      let j = i;
      while (j < n) {
        if (isBlank(lines[j])) {
          let k = j;
          while (k < n && isBlank(lines[k])) k++;
          const nextItem = k < n ? listItem(lines[k]) : null;
          if (nextItem?.kind === first.kind) {
            j = k;
            continue;
          }
          break;
        }
        const item = listItem(lines[j]);
        if (item) {
          if (item.kind !== first.kind) break;
          const textStart = lines[j].start + item.textOffset;
          const end = trimmedBounds(lines[j])[1];
          items.push({ text: "", textStart, start: textStart, end });
          j++;
          continue;
        }
        // A wrapped item: an indented line, or one following a long line.
        const prev = lines[j - 1];
        const indented = /^\s{2,}\S/.test(lines[j].text);
        const prevWrapped = !isBlank(prev) && prev.text.trim().length >= WRAP_JOIN_MIN;
        if (items.length && !startsBlock(j) && (indented || prevWrapped)) {
          items[items.length - 1].end = trimmedBounds(lines[j])[1];
          j++;
          continue;
        }
        break;
      }
      for (const it of items) it.text = inlineText(text, it.textStart, it.end);
      blocks.push({
        type: "list",
        ordered: first.kind !== "bullet",
        items,
        start: items[0].start,
        end: items[items.length - 1].end,
      });
      i = j;
      continue;
    }

    const table = readTable(lines, i);
    if (table) {
      blocks.push({
        type: "table",
        rows: table.rows,
        header: table.header,
        start: trimmedBounds(line)[0],
        end: trimmedBounds(lines[table.next - 1])[1],
      });
      i = table.next;
      continue;
    }

    // A short line on its own reads as a heading, as does an ALL CAPS one.
    const standalone =
      isBlank(lines[i - 1]) && isBlank(lines[i + 1]) && lines.slice(i + 1).some((l) => !isBlank(l));
    const looksLikeTitle =
      trimmed.length < 80 &&
      !/[.,;:!]$/.test(trimmed) &&
      /[A-Za-z]/.test(trimmed) &&
      /^["'“(]?[A-Z0-9]/.test(trimmed) &&
      trimmed.split(/\s+/).length <= 12 &&
      !isUrlLine(trimmed);
    if (isAllCaps(trimmed) || (standalone && looksLikeTitle)) {
      const [s, e] = trimmedBounds(line);
      blocks.push({
        type: "heading",
        level: isAllCaps(trimmed) ? 2 : 3,
        text: text.slice(s, e).replace(/\t/g, " "),
        textStart: s,
        start: s,
        end: e,
      });
      i++;
      continue;
    }

    // Paragraph: run until a blank line or the start of another block.
    let j = i + 1;
    while (j < n && !isBlank(lines[j]) && !startsBlock(j) && !readTable(lines, j)) j++;
    const s = trimmedBounds(line)[0];
    const e = trimmedBounds(lines[j - 1])[1];
    blocks.push({ type: "paragraph", text: inlineText(text, s, e), textStart: s, start: s, end: e });
    i = j;
  }

  return blocks.map((b) => shift(b, offset));
}

// ── Inline links ────────────────────────────────────────────────────────

export type InlineSegment =
  | { type: "text"; text: string; start: number; end: number }
  | { type: "link"; text: string; href: string; start: number; end: number };

const INLINE_TOKEN =
  /[<[]((?:https?:\/\/|mailto:)[^\s<>[\]]+)[>\]]|((?:https?:\/\/|www\.)[^\s<>"]+)|([A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})/g;

// Characters that end the label before a "Label <https://…>" link.
const LABEL_BOUNDARY = /[.!?:;|•·()[\]<>"\n]/;
const MAX_LABEL_WORDS = 5;

export function hostnameOf(href: string): string {
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return href;
  }
}

function trimUrl(url: string): string {
  let u = url.replace(/[.,;:!?'"]+$/, "");
  // Drop an unbalanced closing paren: "(see https://x.org/a)".
  while (u.endsWith(")") && (u.match(/\(/g)?.length ?? 0) < (u.match(/\)/g)?.length ?? 0)) {
    u = u.slice(0, -1).replace(/[.,;:!?'"]+$/, "");
  }
  return u;
}

function displayUrl(url: string, href: string): string {
  // Tracking links run to hundreds of characters; the site is what matters.
  if (url.length > 40) return hostnameOf(href);
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/**
 * Split text into plain runs and links: bare URLs and email addresses become
 * links, and the "Label <https://…>" form plain-text emails use for HTML links
 * becomes a link on Label with the URL hidden. Offsets are into `text`.
 */
export function parseInline(text: string): InlineSegment[] {
  const out: InlineSegment[] = [];
  let cursor = 0;
  const pushText = (start: number, end: number) => {
    if (end > start) out.push({ type: "text", text: text.slice(start, end), start, end });
  };

  INLINE_TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_TOKEN.exec(text))) {
    const tokenStart = m.index;
    let tokenEnd = m.index + m[0].length;

    if (m[1]) {
      const href = m[1];
      const before = text.slice(cursor, tokenStart);
      const trimmed = before.replace(/\s+$/, "");
      let b = trimmed.length - 1;
      while (b >= 0 && !LABEL_BOUNDARY.test(trimmed[b])) b--;
      let labelRel = b + 1;
      while (labelRel < trimmed.length && /\s/.test(trimmed[labelRel])) labelRel++;
      // Keep only the last few words, so a sentence doesn't become a link.
      const words = [...trimmed.slice(labelRel).matchAll(/\S+/g)];
      if (words.length > MAX_LABEL_WORDS) {
        labelRel += words[words.length - MAX_LABEL_WORDS].index!;
      }
      const label = trimmed.slice(labelRel);
      if (label) {
        pushText(cursor, cursor + labelRel);
        out.push({ type: "link", text: label, href, start: cursor + labelRel, end: tokenEnd });
      } else {
        pushText(cursor, tokenStart);
        const shown = href.startsWith("mailto:") ? href.slice(7) : hostnameOf(href);
        out.push({ type: "link", text: shown, href, start: tokenStart, end: tokenEnd });
      }
    } else if (m[2]) {
      const url = trimUrl(m[2]);
      tokenEnd = tokenStart + url.length;
      INLINE_TOKEN.lastIndex = tokenEnd;
      const href = url.startsWith("www.") ? `https://${url}` : url;
      pushText(cursor, tokenStart);
      out.push({ type: "link", text: displayUrl(url, href), href, start: tokenStart, end: tokenEnd });
    } else {
      pushText(cursor, tokenStart);
      out.push({ type: "link", text: m[3], href: `mailto:${m[3]}`, start: tokenStart, end: tokenEnd });
    }
    cursor = tokenEnd;
  }
  pushText(cursor, text.length);
  return out;
}

// ── Website pages ───────────────────────────────────────────────────────

const NAV_NOISE =
  /^(?:skip (?:to )?(?:main )?(?:content|navigation|nav)|skip to main|toggle (?:navigation|menu)|(?:open|close|main) menu|menu|search|close|back to top|scroll to top|print|share|facebook|twitter|instagram|linkedin|youtube|x)$/i;

/**
 * Blank out the parts of a crawled page's stored text that aren't the page:
 * the title and URL lines it's stored with, and navigation leftovers like
 * "Skip To Main Content". Blanked with spaces, so the result is the same
 * length and offsets into it are offsets into the original.
 */
export function cleanWebsiteText(text: string, title: string | null | undefined, url: string | null | undefined): string {
  const lines = splitLines(text);
  const norm = (s: string) => s.trim().toLowerCase().replace(/\/$/, "");
  const blankOut: Line[] = [];
  let leading = true;
  let seenTitle = false;
  let seenUrl = false;

  for (const line of lines) {
    const t = line.text.trim();
    if (!t) continue;
    if (leading && !seenTitle && title && norm(t) === norm(title)) {
      seenTitle = true;
      blankOut.push(line);
      continue;
    }
    // The stored URL line is the crawled URL, which may differ from the
    // canonical `url` the document cites, so any leading URL line goes.
    if (leading && !seenUrl && (isUrlLine(t) || (!!url && norm(t) === norm(url)))) {
      seenUrl = true;
      blankOut.push(line);
      continue;
    }
    if (NAV_NOISE.test(t)) {
      blankOut.push(line);
      continue;
    }
    leading = false;
  }

  if (!blankOut.length) return text;
  const chars = text.split("");
  for (const line of blankOut) {
    for (let k = 0; k < line.text.length; k++) chars[line.start + k] = " ";
  }
  return chars.join("");
}
