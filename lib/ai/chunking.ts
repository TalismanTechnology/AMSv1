const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;

export interface TextChunk {
  content: string;
  index: number;
  metadata: Record<string, unknown>;
}

export function splitTextIntoChunks(
  text: string,
  chunkSize = CHUNK_SIZE,
  overlap = CHUNK_OVERLAP
): TextChunk[] {
  // Clean the text
  const cleaned = text.replace(/\s+/g, " ").trim();

  if (cleaned.length <= chunkSize) {
    return [{ content: cleaned, index: 0, metadata: {} }];
  }

  const chunks: TextChunk[] = [];
  let start = 0;
  let index = 0;

  while (start < cleaned.length) {
    let end = start + chunkSize;

    // Try to break at a sentence boundary
    if (end < cleaned.length) {
      const searchWindow = cleaned.slice(
        Math.max(end - 100, start),
        Math.min(end + 100, cleaned.length)
      );
      const sentenceEnd = searchWindow.search(/[.!?]\s/);
      if (sentenceEnd !== -1) {
        end = Math.max(end - 100, start) + sentenceEnd + 1;
      }
    } else {
      end = cleaned.length;
    }

    const chunk = cleaned.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push({ content: chunk, index, metadata: {} });
      index++;
    }

    // Last chunk — stop
    if (end >= cleaned.length) break;

    start = end - overlap;
  }

  return chunks;
}
