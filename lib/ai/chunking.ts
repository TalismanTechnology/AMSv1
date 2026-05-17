import type { ChunkMetadata } from "./rag";
import type { ParsedSegment } from "@/lib/documents/parser";

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;
// Below this size we don't bother chunking a segment — emit it whole.
const MIN_SEGMENT_FOR_SPLIT = CHUNK_SIZE + 200;

export interface TextChunk {
  content: string;
  index: number;
  metadata: ChunkMetadata;
}

// Legacy entry point — accepts a flat string with no structural metadata.
// New code paths should call splitSegmentsIntoChunks so each chunk carries
// page/sheet/slide info from its source segment.
export function splitTextIntoChunks(
  text: string,
  chunkSize = CHUNK_SIZE,
  overlap = CHUNK_OVERLAP
): TextChunk[] {
  return splitSegmentsIntoChunks(
    [{ text, metadata: {} }],
    chunkSize,
    overlap
  );
}

// Chunk a list of parsed segments. Each output chunk's content stays within
// a single segment so the segment's metadata (page, sheet, etc.) attaches
// cleanly. Overlap is applied within a segment only — we never bleed text
// from page 14 into a chunk tagged "page 15."
export function splitSegmentsIntoChunks(
  segments: ParsedSegment[],
  chunkSize = CHUNK_SIZE,
  overlap = CHUNK_OVERLAP
): TextChunk[] {
  const chunks: TextChunk[] = [];
  let runningIndex = 0;

  for (const segment of segments) {
    const cleaned = segment.text.replace(/\s+/g, " ").trim();
    if (cleaned.length === 0) continue;

    if (cleaned.length < MIN_SEGMENT_FOR_SPLIT) {
      chunks.push({
        content: cleaned,
        index: runningIndex++,
        metadata: { ...segment.metadata },
      });
      continue;
    }

    let start = 0;
    while (start < cleaned.length) {
      let end = start + chunkSize;

      // Try to break at a sentence boundary near `end`
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

      const piece = cleaned.slice(start, end).trim();
      if (piece.length > 0) {
        chunks.push({
          content: piece,
          index: runningIndex++,
          metadata: { ...segment.metadata },
        });
      }

      if (end >= cleaned.length) break;
      start = end - overlap;
    }
  }

  return chunks;
}
