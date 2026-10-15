// Pull the structure back out of an email stored as plain text, so the source
// viewer can show it as an email (sender, date, body) rather than a wall of
// text. Pure string work: runs on the server (source API) and in the browser.
//
// Offsets are into the text passed in, so a cited passage located in the full
// text can still be highlighted inside the body that's rendered.

export interface EmailHeaders {
  from?: string;
  to?: string;
  cc?: string;
  date?: string;
  subject?: string;
}

export interface ForwardedBlock {
  headers: EmailHeaders;
  /** Offsets of the marker line through the last forwarded header line. */
  start: number;
  end: number;
}

export interface ParsedEmailText {
  /** The leading header block (an .eml's "Subject:/From:/…" lines). */
  headers: EmailHeaders;
  /** A "Forwarded message" header block inside the body, if any. */
  forwarded: ForwardedBlock | null;
  body: string;
  /** Where `body` starts in the original text. */
  bodyStart: number;
}

const HEADER_LINE = /^(from|to|cc|date|sent|subject|attachments|reply-to):[ \t]*(.*)$/i;

const FORWARD_MARKER =
  /^[ \t]*(?:-{2,}[ \t]*Forwarded message[ \t]*-{2,}|Begin forwarded message:)[ \t]*$/im;

interface Line {
  text: string;
  start: number;
  /** Offset just past the line's newline (or end of text). */
  next: number;
}

function linesFrom(text: string, from: number): Line[] {
  const out: Line[] = [];
  let pos = from;
  while (pos < text.length) {
    const nl = text.indexOf("\n", pos);
    const end = nl === -1 ? text.length : nl;
    out.push({ text: text.slice(pos, end).replace(/\r$/, ""), start: pos, next: nl === -1 ? end : nl + 1 });
    pos = nl === -1 ? text.length : nl + 1;
  }
  return out;
}

function setHeader(headers: EmailHeaders, key: string, value: string) {
  const k = key.toLowerCase();
  const v = value.trim();
  if (!v) return;
  if (k === "sent" || k === "date") headers.date ??= v;
  else if (k === "from" || k === "to" || k === "cc" || k === "subject") headers[k] ??= v;
}

/**
 * Read a run of header lines starting at `lines[i]`, allowing blank lines
 * between them. Returns the headers and the index of the first line after the
 * block, or null when fewer than `min` header lines were found.
 */
function readHeaderBlock(
  lines: Line[],
  i: number,
  min: number
): { headers: EmailHeaders; nextIndex: number; count: number } | null {
  const headers: EmailHeaders = {};
  let count = 0;
  let last = i - 1;
  for (let j = i; j < lines.length; j++) {
    const t = lines[j].text;
    if (!t.trim()) continue;
    const m = HEADER_LINE.exec(t.trim());
    if (!m) break;
    setHeader(headers, m[1], m[2]);
    count++;
    last = j;
  }
  if (count < min) return null;
  return { headers, nextIndex: last + 1, count };
}

/**
 * Split an email's stored text into its header block and body. Recognises the
 * header block an uploaded .eml is stored with, and a forwarded message's
 * header block inside the body. Text without either comes back as all body.
 */
export function parseEmailText(text: string): ParsedEmailText {
  const lines = linesFrom(text, 0);
  let first = 0;
  while (first < lines.length && !lines[first].text.trim()) first++;

  let headers: EmailHeaders = {};
  let bodyStart = 0;
  // Two header lines at minimum, so a body that merely opens with "To: all
  // families" isn't taken for headers.
  const block = first < lines.length ? readHeaderBlock(lines, first, 2) : null;
  if (block) {
    headers = block.headers;
    bodyStart = block.nextIndex < lines.length ? lines[block.nextIndex].start : text.length;
    while (bodyStart < text.length && /\s/.test(text[bodyStart])) bodyStart++;
  }

  let forwarded: ForwardedBlock | null = null;
  const marker = FORWARD_MARKER.exec(text.slice(bodyStart));
  if (marker) {
    const markerStart = bodyStart + marker.index;
    const after = linesFrom(text, markerStart);
    const fwd = readHeaderBlock(after, 1, 1);
    if (fwd) {
      const lastLine = after[fwd.nextIndex - 1];
      forwarded = {
        headers: fwd.headers,
        start: markerStart,
        end: lastLine.start + lastLine.text.length,
      };
    }
  }

  return { headers, forwarded, body: text.slice(bodyStart), bodyStart };
}

export interface SplitQuoted {
  main: string;
  /** Quoted reply history and signature, or null when there is none. */
  quoted: string | null;
  /** Where `quoted` starts in the text passed in. */
  quotedStart: number | null;
}

const QUOTE_MARKERS: RegExp[] = [
  // Gmail/Apple: "On Mon, Oct 6, 2025 at 9:00 AM Jane <jane@x.org> wrote:",
  // which clients often wrap onto a second line.
  /^[ \t]*On [^\n]{4,200}(?:\n[^\n]{0,200})?\swrote:[ \t]*$/m,
  /^[ \t]*-{2,}[ \t]*Original Message[ \t]*-{2,}/im,
  // Outlook reply header: optional rule, then From: … Sent: … within a few lines.
  /^(?:[ \t]*_{8,}[ \t]*\r?\n)?[ \t]*From:[^\n]*\n(?:[^\n]*\n){0,3}?[ \t]*Sent:[^\n]*$/im,
  // Signature delimiter.
  /^-- ?$/m,
];

/** Start of a trailing run of ">"-quoted lines (blank lines allowed), or -1. */
function trailingQuoteStart(text: string): number {
  const lines = linesFrom(text, 0);
  let start = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = lines[i].text.trim();
    if (!t) continue;
    if (!t.startsWith(">")) break;
    start = lines[i].start;
  }
  return start;
}

/**
 * Separate the new message from what it quotes: earlier replies, an Outlook
 * "Original Message" block, trailing ">" quotes, and the signature. Never
 * leaves the main part empty; when the cut would, everything stays main.
 */
export function splitQuoted(body: string): SplitQuoted {
  let cut = -1;
  for (const re of QUOTE_MARKERS) {
    const m = re.exec(body);
    if (m && (cut === -1 || m.index < cut)) cut = m.index;
  }
  const trailing = trailingQuoteStart(body);
  if (trailing !== -1 && (cut === -1 || trailing < cut)) cut = trailing;

  if (cut === -1) return { main: body, quoted: null, quotedStart: null };
  const main = body.slice(0, cut).trimEnd();
  const quoted = body.slice(cut).trim();
  if (!main.trim() || !quoted) return { main: body, quoted: null, quotedStart: null };
  let quotedStart = cut;
  while (quotedStart < body.length && /\s/.test(body[quotedStart])) quotedStart++;
  return { main, quoted, quotedStart };
}
