// Finding a cited passage inside a document's full text. Chunks come from a
// fixed-size splitter (and the stitched /content text) with whitespace
// collapsed, while the stored text keeps its newlines, so matching tolerates
// whitespace differences throughout.

/**
 * Expand [start, end) outward to the nearest sentence/paragraph boundaries so
 * the highlight never visibly truncates mid-word or mid-sentence. Chunks are
 * produced by a fixed-size splitter and routinely begin/end inside a word.
 */
export function snapToSentence(full: string, start: number, end: number): [number, number] {
  const isSentenceEnd = (i: number) =>
    /[.!?]/.test(full[i]) && (i + 1 >= full.length || /\s/.test(full[i + 1]));
  const isParagraphBreak = (i: number) =>
    full[i] === "\n" && (full[i + 1] === "\n" || i + 1 >= full.length);

  let s = start;
  while (s > 0) {
    const prev = s - 1;
    if (isSentenceEnd(prev) || isParagraphBreak(prev)) break;
    s--;
  }
  while (s < full.length && /\s/.test(full[s])) s++;

  let e = end;
  while (e < full.length) {
    if (isSentenceEnd(e)) { e++; break; }
    if (isParagraphBreak(e)) break;
    e++;
  }
  return [s, e];
}

/**
 * Locate `chunk` inside `full` tolerating whitespace differences and trailing
 * ellipsis markers that come from server-side excerpt truncation.
 * Returns [start, end) indices in the original `full` string, or null if not found.
 */
export function locateChunk(full: string, chunk: string): [number, number] | null {
  if (!full || !chunk) return null;
  // Strip both ASCII "..." and the Unicode ellipsis "…" that the API appends
  // when truncating the excerpt — neither will appear in `full`.
  const cleanChunk = chunk.replace(/(?:\.{3}|…)\s*$/u, "").trim();
  if (!cleanChunk) return null;

  // Fast path: exact substring
  const direct = full.indexOf(cleanChunk);
  if (direct !== -1) return [direct, direct + cleanChunk.length];

  // Whitespace-tolerant match: build a map from normalized index -> original index
  const orig: number[] = [];
  let normalized = "";
  let prevWs = false;
  for (let i = 0; i < full.length; i++) {
    const c = full[i];
    const isWs = /\s/.test(c);
    if (isWs) {
      if (!prevWs && normalized.length > 0) {
        normalized += " ";
        orig.push(i);
      }
      prevWs = true;
    } else {
      normalized += c.toLowerCase();
      orig.push(i);
      prevWs = false;
    }
  }

  const normChunk = cleanChunk.replace(/\s+/g, " ").trim().toLowerCase();
  if (!normChunk) return null;

  const idx = normalized.indexOf(normChunk);
  if (idx !== -1) {
    const start = orig[idx];
    const endIdx = idx + normChunk.length - 1;
    const end = (orig[endIdx] ?? full.length - 1) + 1;
    return [start, end];
  }

  // Anchor fallback: try progressively shorter prefixes (60→40→24 chars) so
  // we still find a match when the excerpt was cut mid-sentence or contains
  // light punctuation drift between excerpt and reconstructed full text.
  for (const len of [60, 40, 24]) {
    if (normChunk.length < len) continue;
    const anchor = normChunk.slice(0, len);
    const anchorIdx = normalized.indexOf(anchor);
    if (anchorIdx === -1) continue;
    const start = orig[anchorIdx];
    const tailLen = Math.min(normChunk.length, normalized.length - anchorIdx);
    const endIdx = anchorIdx + tailLen - 1;
    const end = (orig[endIdx] ?? full.length - 1) + 1;
    return [start, end];
  }
  return null;
}

/** Locate a cited chunk and snap it to whole sentences; null when absent. */
export function locateHighlight(full: string, chunk: string | null | undefined): [number, number] | null {
  if (!chunk) return null;
  const range = locateChunk(full, chunk);
  return range ? snapToSentence(full, range[0], range[1]) : null;
}
