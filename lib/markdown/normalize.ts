// One place for everything that turns AI-written markdown into something a
// parent should see: no literal **, stray backticks, half-typed links or
// HTML entities, whether the text is rendered as markdown or shown as plain
// text.
//
//   normalizeMarkdown        pre-pass before a markdown renderer (final text)
//   completePartialMarkdown  closes/hides unfinished syntax in a streaming answer
//   prepareMarkdown          what the chat renderer feeds react-markdown
//   stripMarkdown            plain text for titles, previews, push, share, email
//   decodeHtmlEntities       &amp; &#39; &rsquo; … → characters
//
// The pairing of ** that CommonMark refuses (flanking rules) is repaired after
// parsing by ./remark-repair-emphasis, which works on the parsed tree.

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ensp: " ",
  emsp: " ",
  thinsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  sbquo: "‚",
  ldquo: "“",
  rdquo: "”",
  bdquo: "„",
  laquo: "«",
  raquo: "»",
  bull: "•",
  middot: "·",
  deg: "°",
  copy: "©",
  reg: "®",
  trade: "™",
  times: "×",
  divide: "÷",
  plusmn: "±",
  frac12: "½",
  frac14: "¼",
  frac34: "¾",
  cent: "¢",
  pound: "£",
  euro: "€",
  yen: "¥",
  sect: "§",
  para: "¶",
  aacute: "á",
  eacute: "é",
  iacute: "í",
  oacute: "ó",
  uacute: "ú",
  ntilde: "ñ",
  agrave: "à",
  egrave: "è",
  ccedil: "ç",
  uuml: "ü",
  ouml: "ö",
  auml: "ä",
  Aacute: "Á",
  Eacute: "É",
  Ntilde: "Ñ",
};

const ENTITY_RE = /&(#[xX][0-9a-fA-F]{1,6}|#\d{1,7}|[a-zA-Z][a-zA-Z0-9]{1,8});/g;

function decodeEntity(match: string, body: string): string {
  if (body[0] === "#") {
    const code =
      body[1] === "x" || body[1] === "X"
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
    if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match;
    if (code >= 0xd800 && code <= 0xdfff) return match;
    return code === 0xa0 ? " " : String.fromCodePoint(code);
  }
  return NAMED_ENTITIES[body] ?? NAMED_ENTITIES[body.toLowerCase()] ?? match;
}

/**
 * Decode HTML entities, including double-encoded ones like `&amp;#39;`.
 * Unknown entities are left as they are.
 */
export function decodeHtmlEntities(text: string): string {
  let out = text;
  // Up to three rounds undoes `&amp;amp;#39;`-style repeated escaping.
  for (let round = 0; round < 3; round++) {
    const next = out.replace(ENTITY_RE, decodeEntity);
    if (next === out) break;
    out = next;
  }
  return out;
}

// Characters that survive copy/paste from documents and break emphasis
// flanking without being visible.
const INVISIBLE_RE = /[​‌‍⁠﻿­]/g;

/**
 * Apply `fn` to the parts of `text` that are not code (fenced blocks or
 * inline code spans), leaving code exactly as written.
 */
function mapOutsideCode(text: string, fn: (prose: string) => string): string {
  const out: string[] = [];
  const lines = text.split("\n");
  let prose: string[] = [];
  let fence: string | null = null;
  const flushProse = () => {
    if (prose.length) out.push(mapOutsideInlineCode(prose.join("\n"), fn));
    prose = [];
  };
  const codeLines: string[] = [];
  for (const line of lines) {
    const m = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fence === null) {
      if (m) {
        flushProse();
        fence = m[1];
        codeLines.length = 0;
        codeLines.push(line);
      } else {
        prose.push(line);
      }
    } else {
      codeLines.push(line);
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length && line.trim() === m[1]) {
        out.push(codeLines.join("\n"));
        codeLines.length = 0;
        fence = null;
      }
    }
  }
  if (fence !== null) out.push(codeLines.join("\n"));
  flushProse();
  return out.join("\n");
}

function mapOutsideInlineCode(text: string, fn: (prose: string) => string): string {
  let result = "";
  let cursor = 0;
  let i = 0;
  while (i < text.length) {
    if (text[i] === "\\") {
      i += 2;
      continue;
    }
    if (text[i] !== "`") {
      i++;
      continue;
    }
    let j = i;
    while (text[j] === "`") j++;
    const close = findBacktickRun(text, j, j - i);
    if (close === -1) {
      i = j;
      continue;
    }
    result += fn(text.slice(cursor, i)) + text.slice(i, close + (j - i));
    cursor = i = close + (j - i);
  }
  return result + fn(text.slice(cursor));
}

/** Index of the next backtick run of exactly `len` at or after `from`, or -1. */
function findBacktickRun(text: string, from: number, len: number): number {
  let i = from;
  while (i < text.length) {
    if (text[i] !== "`") {
      i++;
      continue;
    }
    let j = i;
    while (text[j] === "`") j++;
    if (j - i === len) return i;
    i = j;
  }
  return -1;
}

function normalizeProse(prose: string): string {
  return (
    prose
      // Inline HTML line breaks.
      .replace(/<br\s*\/?>/gi, "  \n")
      // Entities: decode everything except the three markdown-significant
      // ones, which the parser itself decodes (so `&lt;b&gt;` stays text).
      .replace(/&amp;(?=(?:#[xX][0-9a-fA-F]{1,6}|#\d{1,7}|[a-zA-Z][a-zA-Z0-9]{1,8});)/g, "&")
      .replace(/&amp;(?=(?:#[xX][0-9a-fA-F]{1,6}|#\d{1,7}|[a-zA-Z][a-zA-Z0-9]{1,8});)/g, "&")
      .replace(ENTITY_RE, (match, body: string) => {
        const decoded = decodeEntity(match, body);
        return decoded === "&" || decoded === "<" || decoded === ">" ? match : decoded;
      })
      // Escaped emphasis the model meant as formatting: \*\*Friday\*\*.
      .replace(/\\\*\\\*([^*\n]+?)\\\*\\\*/g, "**$1**")
      .replace(/\\_\\_([^_\n]+?)\\_\\_/g, "__$1__")
      // Typographic bullets → markdown list items.
      .replace(/^([ \t]*)[•·▪◦‣●][ \t]*/gm, "$1- ")
      // "-**Bold**" / "1.**Bold**": a list marker needs a space after it.
      .replace(/^([ \t]*)(-|\+|\d{1,3}[.)])(?=\*\*|__)/gm, "$1$2 ")
      // "** text **" → " **text** ": whitespace inside the markers stops
      // them pairing, so move it outside.
      .replace(/\*\*([^*\n]+?)\*\*/g, (match, inner: string) => {
        const trimmed = inner.trim();
        if (!trimmed || trimmed === inner) return match;
        const lead = inner.slice(0, inner.length - inner.trimStart().length);
        const trail = inner.slice(inner.trimEnd().length);
        return `${lead ? " " : ""}**${trimmed}**${trail ? " " : ""}`;
      })
      // The same for __text__.
      .replace(/(^|[^\w_])__([^_\n]+?)__(?![\w_])/g, (match, pre: string, inner: string) => {
        const trimmed = inner.trim();
        if (!trimmed || trimmed === inner) return match;
        return `${pre}__${trimmed}__`;
      })
  );
}

/**
 * Pre-pass for any markdown renderer: fixes the things the model writes that
 * a CommonMark parser would otherwise show as literal characters.
 * Code (fenced and inline) is left untouched.
 */
export function normalizeMarkdown(text: string): string {
  if (!text) return "";
  const cleaned = text
    .replace(/\r\n?/g, "\n")
    .replace(INVISIBLE_RE, "")
    // Older cached answers cite as [Source N].
    .replace(/\[Source\s+(\d+)\]/gi, "[$1]");
  return mapOutsideCode(cleaned, normalizeProse);
}

const FOLLOW_UP_MARKER = "---FOLLOW_UPS---";

// A trailing "[", "[1", "[Sour", "[Source 1" — a citation that is still
// arriving. Hidden until it is complete so it doesn't flash as text.
const PARTIAL_CITATION_RE = /\[(?:S(?:o(?:u(?:r(?:c(?:e)?)?)?)?)?)?\s*\d*$/i;

/**
 * Close or hide unfinished markdown at the end of a streaming answer, so a
 * half-arrived `**bold`, `` `code``, `[link](htt` or `[1` never shows as raw
 * characters. Only meant for an in-progress message: the finished text is
 * rendered as written.
 */
export function completePartialMarkdown(input: string): string {
  let text = (input ?? "").replace(/\r\n?/g, "\n");

  // Unclosed fenced code block: close it so the rest isn't parsed as prose.
  const fences = text.match(/^\s{0,3}(?:```|~~~)/gm) ?? [];
  if (fences.length % 2 === 1) {
    return text.endsWith("\n") ? `${text}\`\`\`` : `${text}\n\`\`\``;
  }

  // Trailing line that could still become something else.
  const lastBreak = text.lastIndexOf("\n");
  const lastLine = text.slice(lastBreak + 1);
  const lastTrimmed = lastLine.trim();
  if (
    lastTrimmed &&
    (FOLLOW_UP_MARKER.startsWith(lastTrimmed) || // "-", "--", "---FOLL" (also setext/hr)
      /^=+$/.test(lastTrimmed) || // setext underline
      /^#{1,6}$/.test(lastTrimmed) || // heading with no text yet
      /^(?:[-+]|\d{1,3}[.)])$/.test(lastTrimmed) || // list marker with no text yet
      /^\|?[\s:|-]*$/.test(lastTrimmed)) // half a table separator row
  ) {
    text = text.slice(0, lastBreak + 1);
  }

  // Unfinished links, images, citations, entities and escapes at the very end.
  text = text
    .replace(/!\[[^\]\n]*(?:\]\([^)\n]*)?$/, "")
    .replace(/!\[[^\]\n]*\]$/, "")
    .replace(/\[([^\]\n]*)\]\([^)\n]*$/, "$1")
    .replace(PARTIAL_CITATION_RE, "")
    .replace(/\[([^\]\n]*)$/, "$1")
    .replace(/&(?:#[xX]?[0-9a-fA-F]{0,6}|[a-zA-Z][a-zA-Z0-9]{0,8})$/, "")
    .replace(/(^|[^\\])\\$/, "$1");

  // Inline markers only pair inside a paragraph, so only the last one can be
  // unfinished.
  const blank = /\n[ \t]*\n(?![\s\S]*\n[ \t]*\n)/.exec(text);
  const start = blank ? blank.index + blank[0].length : 0;
  return text.slice(0, start) + completeInline(text.slice(start));
}

interface OpenMarker {
  ch: string;
  len: number;
  pos: number;
}

const WS = /\s/;
const ALNUM = /[\p{L}\p{N}]/u;

function completeInline(source: string): string {
  let s = source;
  const stack: OpenMarker[] = [];
  let openCode: { pos: number; len: number } | null = null;
  let partialClose = "";
  let dangling = -1;

  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === "`") {
      let j = i;
      while (s[j] === "`") j++;
      const close = findBacktickRun(s, j, j - i);
      if (close === -1) {
        openCode = { pos: i, len: j - i };
        break;
      }
      i = close + (j - i);
      continue;
    }
    if (c !== "*" && c !== "_" && c !== "~") {
      i++;
      continue;
    }

    let j = i;
    while (s[j] === c) j++;
    const len = j - i;
    const prev = i > 0 ? s[i - 1] : "\n";
    const next = j < s.length ? s[j] : "";
    const prevWs = WS.test(prev);
    const nextWs = next === "" || WS.test(next);
    const restBlank = s.slice(j).trim() === "";
    const lineStart = i === 0 || prev === "\n" || /^\s*$/.test(s.slice(s.lastIndexOf("\n", i - 1) + 1, i));
    let topIndex = -1;
    for (let k = stack.length - 1; k >= 0; k--) {
      if (stack[k].ch === c) {
        topIndex = k;
        break;
      }
    }

    // A list bullet ("* item" / "- item") is not emphasis.
    if (c === "*" && len === 1 && lineStart && next === " ") {
      i = j;
      continue;
    }
    // Single ~ is plain text ("~5 minutes").
    if (c === "~" && len === 1 && !(j === s.length && topIndex !== -1)) {
      if (j === s.length) dangling = i;
      i = j;
      continue;
    }

    let canOpen = !nextWs;
    let canClose = !prevWs;
    if (c === "_" || len === 1) {
      // Intraword _ (snake_case, file_name) and 5*3 are literal.
      if (ALNUM.test(prev) && next !== "" && ALNUM.test(next)) {
        canOpen = false;
        canClose = c === "*" && topIndex !== -1;
      }
      if (c === "_" && ALNUM.test(prev)) canOpen = false;
    }
    // "** text" / "text **": the model's padded markers, which
    // normalizeMarkdown later tightens.
    if (len >= 2 && !canOpen && prevWs && !restBlank) canOpen = true;
    if (len >= 2 && !canClose && topIndex !== -1 && nextWs) canClose = true;

    if (canClose && topIndex !== -1) {
      const top = stack[topIndex];
      stack.length = topIndex;
      if (j === s.length && len < top.len) partialClose = c.repeat(top.len - len);
      i = j;
      continue;
    }
    if (canOpen && !restBlank) {
      stack.push({ ch: c, len, pos: i });
    } else if (restBlank) {
      // Ends the text without closing anything: the start of a marker
      // whose meaning isn't known yet.
      dangling = i;
      break;
    }
    i = j;
  }

  if (openCode) {
    const body = s.slice(openCode.pos + openCode.len);
    if (body.trim() === "") s = s.slice(0, openCode.pos);
    else s += "`".repeat(openCode.len);
  } else if (dangling !== -1) {
    s = s.slice(0, dangling);
  }

  if (partialClose) s += partialClose;

  for (let k = stack.length - 1; k >= 0; k--) {
    const open = stack[k];
    if (open.pos >= s.length) continue;
    const body = s.slice(open.pos + open.len);
    if (body.trim() === "") {
      s = s.slice(0, open.pos);
    } else {
      s = s.replace(/\s+$/, "") + open.ch.repeat(open.len);
    }
  }
  return s;
}

/** Markdown for the chat renderer: normalized, and completed while streaming. */
export function prepareMarkdown(text: string, options: { streaming?: boolean } = {}): string {
  return normalizeMarkdown(options.streaming ? completePartialMarkdown(text) : text);
}

export interface StripMarkdownOptions {
  /** Remove [1]-style citation markers (default true). */
  citations?: boolean;
  /** Prefix for list items; "" drops the marker (default "• "). */
  bullet?: string;
  /** Collapse everything onto one line, for titles and previews (default false). */
  singleLine?: boolean;
  /** Cut to this many characters on a word boundary, adding "…". */
  maxLength?: number;
}

/**
 * Plain text with no markdown left in it, for every surface that can't render
 * markdown: chat titles, previews, push notifications, share text, emails.
 */
export function stripMarkdown(text: string | null | undefined, options: StripMarkdownOptions = {}): string {
  if (!text) return "";
  const { citations = true, bullet = "• ", singleLine = false, maxLength } = options;

  let out = normalizeMarkdown(text);

  // Fenced code: keep the code, drop the fences.
  out = out.replace(/^[ \t]{0,3}(`{3,}|~{3,})[^\n]*\n([\s\S]*?)(?:\n[ \t]{0,3}\1[ \t]*(?=\n|$)|$)/gm, "$2");
  out = out
    .replace(/<\/?[a-zA-Z][^>\n]*>/g, "") // inline HTML tags
    .replace(/`+([^`\n]+?)`+/g, "$1") // inline code
    .replace(/!\[([^\]\n]*)\]\([^)\n]*\)/g, "$1") // images → alt text
    .replace(/\[([^\]\n]+)\]\((?:[^()\n]|\([^)\n]*\))*\)/g, "$1") // [label](url)
    .replace(/\[([^\]\n]+)\]\[[^\]\n]*\]/g, (m, label: string) => (/^\d+$/.test(label) ? m : label)) // [label][ref]
    .replace(/<(https?:\/\/[^>\s]+)>/g, "$1") // autolinks
    .replace(/^[ \t]{0,3}\[[^\]\n]+\]:[ \t]+\S+.*$/gm, "") // link definitions
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+(.*?)[ \t]*#*[ \t]*$/gm, "$1") // ATX headings
    .replace(/^(.+)\n[ \t]{0,3}(?:=+|-+)[ \t]*$/gm, "$1") // setext headings
    .replace(/^[ \t]{0,3}(?:[-*_][ \t]*){3,}$/gm, "") // horizontal rules
    .replace(/^[ \t]{0,3}>[ \t]?/gm, "") // blockquotes
    .replace(/^[ \t]*\|?[ \t]*:?-{2,}:?[ \t]*(?:\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*(?:\n|$)/gm, "") // table separator rows
    .replace(/^[ \t]*\|(.*)\|[ \t]*$/gm, (_m, row: string) =>
      row
        .split("|")
        .map((cell) => cell.trim())
        .filter(Boolean)
        .join(" · ")
    )
    .replace(/^([ \t]*)[-*+][ \t]+\[[ xX]\][ \t]+/gm, `$1${bullet}`) // task items
    .replace(/^([ \t]*)[-*+][ \t]+/gm, `$1${bullet}`); // bullets

  if (citations) {
    out = out.replace(/[ \t]?\[\d+(?:\s*[,–-]\s*\d+)*\](?!\()/g, "");
  }

  // Emphasis: strongest first, repeatedly for nesting.
  for (let round = 0; round < 3; round++) {
    const before = out;
    out = out
      .replace(/\*\*\*([^*\n]+?)\*\*\*/g, "$1")
      .replace(/\*\*([^\n]+?)\*\*/g, "$1")
      .replace(/(^|[^\p{L}\p{N}_])___([^_\n]+?)___(?![\p{L}\p{N}_])/gu, "$1$2")
      .replace(/(^|[^\p{L}\p{N}_])__([^\n]+?)__(?![\p{L}\p{N}_])/gu, "$1$2")
      .replace(/(^|[^*\\])\*(?![\s*])([^*\n]*?[^\s*\\])\*(?!\*)/g, "$1$2")
      .replace(/(^|[^\p{L}\p{N}_\\])_(?![\s_])([^_\n]*?[^\s_\\])_(?![\p{L}\p{N}_])/gu, "$1$2")
      .replace(/~~([^~\n]+?)~~/g, "$1");
    if (out === before) break;
  }

  out = out
    // Leftover unpaired markers (a cut-off answer, "**" on its own).
    .replace(/(^|\s)\*{2,3}(?=\S)|(?<=\S)\*{2,3}(?=\s|$|[.,;:!?)])/g, "$1")
    .replace(/(^|\s)\*{2,}(?=\s|$)/g, "$1")
    .replace(/(?<![\w`])`{1,3}(?![\w`])/g, "")
    // Backslash escapes: \* → *.
    .replace(/\\([\\`*_{}[\]()#+\-.!|~<>])/g, "$1");

  out = decodeHtmlEntities(out).replace(/ /g, " ");

  if (singleLine) {
    out = out.replace(/\s+/g, " ").trim();
  } else {
    out = out
      .replace(/(\S)[ \t]{2,}(?=\S)/g, "$1 ")
      .replace(/[ \t]+$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  if (maxLength && out.length > maxLength) {
    const cut = out.slice(0, maxLength - 1);
    const space = cut.lastIndexOf(" ");
    out = `${(space > maxLength * 0.5 ? cut.slice(0, space) : cut).replace(/[\s,;:.–—-]+$/, "")}…`;
  }
  return out;
}
