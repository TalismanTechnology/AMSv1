// How each side of a conflict is labelled on Admin > Conflicts: where the
// document came from and when, so an admin can tell the standing handbook
// from last week's email at a glance. Pure, so it is unit-tested.

export interface SideOrigin {
  source: string | null;
  sourceUrl: string | null;
  fileType: string | null;
  createdAt: string | null;
  emailDate: string | null;
  /** formatChunkLocation()'s label, e.g. "p. 10". */
  location: string | null;
  divisions?: string[];
}

/** Side B counts as newer only when it is more than this much newer than A. */
export const NEWER_MARGIN_MS = 24 * 60 * 60 * 1000;

const FILE_KINDS: Record<string, string> = {
  pdf: "PDF",
  doc: "Word document",
  docx: "Word document",
  xls: "spreadsheet",
  xlsx: "spreadsheet",
  csv: "spreadsheet",
  ppt: "slides",
  pptx: "slides",
};

function parseTime(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

/** "Nov 2, 2026", in UTC so the server and the browser agree. */
export function formatShortDate(iso: string | null | undefined): string | null {
  const t = parseTime(iso);
  if (t === null) return null;
  return new Date(t).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function isWebsiteOrigin(o: Pick<SideOrigin, "source" | "sourceUrl">): boolean {
  return o.source === "website" || !!o.sourceUrl;
}

/** When the document was written: an email's sent date, else when it was added. */
export function originTime(o: Pick<SideOrigin, "createdAt" | "emailDate">): number | null {
  return parseTime(o.emailDate) ?? parseTime(o.createdAt);
}

/**
 * One line naming the document's kind, date, place and divisions, e.g.
 * "Email · Nov 2, 2026", "Uploaded PDF · Oct 12, 2026 · Page 10",
 * "Website page".
 */
export function originLabel(o: SideOrigin): string {
  const parts: string[] = [];
  if (isWebsiteOrigin(o)) {
    parts.push("Website page");
  } else if (o.source === "email") {
    parts.push("Email");
    const date = formatShortDate(o.emailDate ?? o.createdAt);
    if (date) parts.push(date);
  } else {
    parts.push(`Uploaded ${FILE_KINDS[(o.fileType ?? "").toLowerCase()] ?? "file"}`);
    const date = formatShortDate(o.createdAt);
    if (date) parts.push(date);
  }
  if (o.location) parts.push(o.location.replace(/^p\. /, "Page "));
  const divisions = (o.divisions ?? []).filter(Boolean);
  if (divisions.length > 0) parts.push(divisions.join(", "));
  return parts.join(" · ");
}

/** Is `b` clearly (more than NEWER_MARGIN_MS) newer than `a`? False when either date is unknown. */
export function isClearlyNewer(
  a: Pick<SideOrigin, "createdAt" | "emailDate">,
  b: Pick<SideOrigin, "createdAt" | "emailDate">
): boolean {
  const ta = originTime(a);
  const tb = originTime(b);
  return ta !== null && tb !== null && tb - ta > NEWER_MARGIN_MS;
}
