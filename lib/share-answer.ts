import type { ChatSource } from "@/lib/types";
import { stripMarkdown } from "@/lib/markdown/normalize";

// Plain-text version of a chat answer for the share sheet / clipboard:
// markdown and [n] citation markers removed, the cited documents listed
// underneath so whoever receives it knows where the answer came from.

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

  const parts = [stripMarkdown(content)];
  if (titles.length > 0) {
    parts.push(`Sources:\n${titles.map((title) => `• ${title}`).join("\n")}`);
  }
  parts.push(schoolName ? `From ${schoolName} on AskMySchool` : "From AskMySchool");
  return parts.join("\n\n");
}
