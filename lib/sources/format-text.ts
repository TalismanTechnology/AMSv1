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
  return (
    letters.length >= 4 &&
    !/[a-z]/.test(t) &&
    t.length < 80 &&
    letters.length >= t.replace(/\s/g, "").length * 0.6 &&
    !looksLikeDateOrTime(t)
  );
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
      !isUrlLine(trimmed) &&
      !looksLikeDateOrTime(trimmed) &&
      // Mostly letters: "5:30 PM - 7:30 PM", "Room 204", "$1,250" are data, not titles.
      (trimmed.match(/[A-Za-z]/g)?.length ?? 0) >= Math.max(4, trimmed.replace(/\s/g, "").length * 0.6);
    // A heading introduces content: the next line must be a real paragraph
    // or list, not another short data line ("Auditorium", "Room 204").
    const nextLine = lines.slice(i + 1).find((l) => !isBlank(l))?.text.trim() ?? "";
    const introducesContent =
      nextLine.length >= 40 ||
      (nextLine.length >= 20 && /[.!?:]$/.test(nextLine)) ||
      /^(?:[-*•·▪]|\d+[.)]|#)\s/.test(nextLine);
    if (isAllCaps(trimmed) || (standalone && looksLikeTitle && introducesContent)) {
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

const MONTH =
  "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?";
const WEEKDAY =
  "(?:mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\\.?,?";
const DATE_OR_TIME = new RegExp(
  [
    `^(?:${WEEKDAY}\\s+)?${MONTH}\\s+\\d{1,2}(?:st|nd|rd|th)?,?(?:\\s+\\d{4})?(?:\\s*[-–@,]?\\s*.*\\d{1,2}(?::\\d{2})?\\s*(?:am|pm))?$`,
    `^(?:${WEEKDAY}\\s+)?\\d{1,2}\\s+${MONTH}(?:\\s+\\d{4})?$`,
    `^${WEEKDAY}$`,
    `^\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4}$`,
    `^(?:all day|noon|midnight|\\d{1,2}(?::\\d{2})?\\s*(?:am|pm|a\\.m\\.|p\\.m\\.)?)(?:\\s*[-–to]+\\s*\\d{1,2}(?::\\d{2})?\\s*(?:am|pm|a\\.m\\.|p\\.m\\.)?)?$`,
  ].join("|"),
  "i"
);

/** Dates and times ("Oct 19 2026", "5:30 PM - 7:30 PM", "Friday") are data lines, not headings. */
export function looksLikeDateOrTime(line: string): boolean {
  return DATE_OR_TIME.test(line.trim());
}

// ── Inline links ────────────────────────────────────────────────────────

export type InlineSegment =
  | {
      type: "text";
      text: string;
      start: number;
      end: number;
      /** Markdown-style *bold*, **bold** or _italic_; `text` has the markers removed. */
      emphasis?: "strong" | "em";
      /** Characters of marker before `text` begins (offset of text = start + markerLen). */
      markerLen?: number;
    }
  | { type: "link"; text: string; href: string; start: number; end: number };

const INLINE_TOKEN =
  /[<[]((?:https?:\/\/|mailto:)[^\s<>[\]]+)[>\]]|((?:https?:\/\/|www\.)[^\s<>"]+)|([A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})/g;

// Characters that end the label before a "Label <https://…>" link.
const LABEL_BOUNDARY = /[.!?:;|•·()[\]<>"\n]/;
const MAX_LABEL_WORDS = 5;

// Words that end a link label when walking back from the link: a label is
// "waiver form", not "complete the mandatory waiver form".
const LABEL_STOP_WORDS = new Set(
  "a an the to and or but of for in on at by with from into via this that these those our your their my his her its we you they i it is are was were be will can please click here see visit".split(" ")
);

/**
 * Where, within the words before a "<https://…>" link, the link's label
 * starts. A trailing run of Capitalized words (a name like "Ferox's Ninja
 * Park", allowing "of"/"the"/"&" inside) is the label; otherwise the
 * trailing words up to the nearest function word, at most MAX_LABEL_WORDS.
 */
export function labelStartIn(phrase: string): number {
  const words = [...phrase.matchAll(/\S+/g)];
  if (!words.length) return phrase.length;
  const bare = (w: string) => w.replace(/^["'“(]+|["'”),]+$/g, "");
  const isCap = (w: string) => /^[A-Z0-9]/.test(bare(w));
  const CONNECTORS = new Set(["of", "the", "&", "and", "for", "at", "on", "de"]);

  // Proper-noun run.
  let k = words.length - 1;
  if (isCap(words[k][0])) {
    let first = k;
    while (k > 0) {
      const prev = words[k - 1][0];
      if (isCap(prev)) { first = --k; continue; }
      if (CONNECTORS.has(bare(prev).toLowerCase()) && k - 2 >= 0 && isCap(words[k - 2][0])) {
        k -= 2; first = k; continue;
      }
      break;
    }
    // A sentence-initial capital ("This year we visit Park") isn't part of the name.
    while (first < words.length - 1 && LABEL_STOP_WORDS.has(bare(words[first][0]).toLowerCase())) first++;
    if (words.length - first <= MAX_LABEL_WORDS + 2) return words[first].index!;
  }

  // Lowercase phrase: walk back until a function word.
  let first = words.length;
  while (first > 0 && words.length - first < MAX_LABEL_WORDS) {
    if (LABEL_STOP_WORDS.has(bare(words[first - 1][0]).toLowerCase())) break;
    first--;
  }
  return words[Math.min(first, words.length - 1)].index!;
}

const EMPHASIS = /(\*\*|__)(?=\S)([^*_\n]+?)(?<=\S)\1|(?<![\w*])\*(?=\S)([^*\n]+?)(?<=\S)\*(?![\w*])|(?<![\w_])_(?=\S)([^_\n]+?)(?<=\S)_(?![\w_])/g;

/** Split a plain run into text and markdown-style emphasis segments. */
export function splitEmphasis(text: string, start: number, end: number): InlineSegment[] {
  const out: InlineSegment[] = [];
  const run = text.slice(start, end);
  let cursor = 0;
  EMPHASIS.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = EMPHASIS.exec(run))) {
    if (m.index > cursor) out.push({ type: "text", text: run.slice(cursor, m.index), start: start + cursor, end: start + m.index });
    const inner = m[2] ?? m[3] ?? m[4];
    const marker = m[1] ? 2 : 1;
    out.push({
      type: "text",
      text: inner,
      start: start + m.index,
      end: start + m.index + m[0].length,
      emphasis: m[4] !== undefined ? "em" : "strong",
      markerLen: marker,
    });
    cursor = m.index + m[0].length;
  }
  if (cursor < run.length) out.push({ type: "text", text: run.slice(cursor), start: start + cursor, end });
  return out;
}

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
    if (end > start) out.push(...splitEmphasis(text, start, end));
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
      labelRel += labelStartIn(trimmed.slice(labelRel));
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
