import type { ChatSource } from "@/lib/types";

// Plain-text version of a chat answer for the share sheet / clipboard:
// markdown and [n] citation markers removed, the cited documents listed
// underneath so whoever receives it knows where the answer came from.

function plainText(markdown: string): string {
  return markdown
    .replace(/\s?\[\d+\](?!\()/g, "") // citation markers like [2]
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // [label](url) -> label
    .replace(/^#{1,6}\s+/gm, "") // headings
    .replace(/(\*\*|__)(.+?)\1/g, "$2") // bold
    .replace(/(^|[^*])\*(?!\s)([^*]+?)\*/g, "$1$2") // italics
    .replace(/`([^`]+)`/g, "$1") // inline code
    .replace(/^[ \t]*[-*+][ \t]+\[[ xX]\][ \t]+/gm, "• ") // task list items
    .replace(/^[ \t]*[-*+][ \t]+/gm, "• ") // bullets
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function shareableAnswer(
  content: string,
  sources: ChatSource[] | undefined,
  schoolName?: string
): string {
  const cited = new Set([...content.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));

  const titles: string[] = [];
  (sources ?? []).forEach((source, index) => {
    const number = source.source_number ?? index + 1;
    if (cited.size > 0 && !cited.has(number)) return;
    const label = source.location?.label ? `${source.title} (${source.location.label})` : source.title;
    if (!titles.includes(label)) titles.push(label);
  });

  const parts = [plainText(content)];
  if (titles.length > 0) {
    parts.push(`Sources:\n${titles.map((title) => `• ${title}`).join("\n")}`);
  }
  parts.push(schoolName ? `From ${schoolName} on AskMySchool` : "From AskMySchool");
  return parts.join("\n\n");
}
