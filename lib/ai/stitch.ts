// Chunks are split with overlap, so neighbours repeat text at the seam.
const MAX_SEAM_OVERLAP = 400;

/**
 * Join chunks in document order, removing the duplicated text where two
 * adjacent chunks overlap, and marking real gaps so skipped material isn't
 * read as continuous prose.
 *
 * Shared by the prompt (cited passages) and the source sidebar (the full
 * document it highlights inside), so a cited passage is always a literal
 * substring of the document text it is located in.
 */
export function stitchChunks(ordered: { content: string; chunk_index: number }[]): string {
  let out = "";
  let prevIndex: number | null = null;

  for (const chunk of ordered) {
    if (out === "") {
      out = chunk.content;
      prevIndex = chunk.chunk_index;
      continue;
    }

    if (prevIndex != null && chunk.chunk_index > prevIndex + 1) {
      out += "\n[...]\n" + chunk.content;
      prevIndex = chunk.chunk_index;
      continue;
    }

    // Adjacent: drop the longest suffix of what we have that repeats as a
    // prefix of the next chunk. Chunks that start a new page share no overlap,
    // so they are separated rather than run together.
    const window = Math.min(MAX_SEAM_OVERLAP, out.length, chunk.content.length);
    let overlap = 0;
    for (let len = window; len > 20; len--) {
      if (out.endsWith(chunk.content.slice(0, len))) {
        overlap = len;
        break;
      }
    }
    out += overlap > 0 ? chunk.content.slice(overlap) : "\n\n" + chunk.content;
    prevIndex = chunk.chunk_index;
  }

  return out;
}
