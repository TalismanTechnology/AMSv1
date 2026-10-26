import { stripMarkdown } from "@/lib/markdown/normalize";

const FOLLOW_UP_MARKER = "---FOLLOW_UPS---";

/**
 * The line the model adds to the follow-up block when its reply is "I couldn't
 * find this in the school's information" for a genuine school question (asked
 * for only when no documents matched; see lib/ai/system-prompt.ts). Tolerates
 * stray punctuation or markdown around it.
 */
export const NOT_FOUND_MARKER = "NOT_FOUND";
const NOT_FOUND_LINE = /^[\s\W_]*NOT[_ ]FOUND[\s\W_]*$/i;

interface ParsedContent {
  content: string;
  followUps: string[];
  /** The model marked this reply as a genuine "couldn't find it" answer. */
  notFound: boolean;
}

export function parseFollowUps(rawContent: string): ParsedContent {
  const markerIndex = rawContent.indexOf(FOLLOW_UP_MARKER);
  if (markerIndex === -1) {
    return { ...stripTrailingNotFound(rawContent), followUps: [] };
  }

  const before = stripTrailingNotFound(rawContent.slice(0, markerIndex).trimEnd());
  const followUpLines = rawContent
    .slice(markerIndex + FOLLOW_UP_MARKER.length)
    .trim()
    .split("\n");
  const notFound =
    before.notFound || followUpLines.some((line) => NOT_FOUND_LINE.test(line));

  const followUps = followUpLines
    .filter((line) => !NOT_FOUND_LINE.test(line))
    // Chips are plain text and become the parent's next question.
    .map((line) =>
      stripMarkdown(line.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, ""), { singleLine: true })
    )
    .filter((line) => line.length > 0)
    .slice(0, 3);

  return { content: before.content, followUps, notFound };
}

/** The marker misplaced at the end of the answer itself: drop it, keep the flag. */
function stripTrailingNotFound(content: string): { content: string; notFound: boolean } {
  const lines = content.trimEnd().split("\n");
  if (lines.length > 0 && NOT_FOUND_LINE.test(lines[lines.length - 1])) {
    return { content: lines.slice(0, -1).join("\n").trimEnd(), notFound: true };
  }
  return { content, notFound: false };
}
