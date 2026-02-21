const FOLLOW_UP_MARKER = "---FOLLOW_UPS---";

interface ParsedContent {
  content: string;
  followUps: string[];
}

export function parseFollowUps(rawContent: string): ParsedContent {
  const markerIndex = rawContent.indexOf(FOLLOW_UP_MARKER);
  if (markerIndex === -1) {
    return { content: rawContent, followUps: [] };
  }

  const content = rawContent.slice(0, markerIndex).trimEnd();
  const followUpBlock = rawContent.slice(markerIndex + FOLLOW_UP_MARKER.length).trim();

  const followUps = followUpBlock
    .split("\n")
    .map((line) => line.replace(/^\d+[\.\)]\s*/, "").trim())
    .filter((line) => line.length > 0)
    .slice(0, 3);

  return { content, followUps };
}
