// The admin command palette's index: every admin page, every setting, and the
// features that live inside a page (flagged chats, Auto-folder, …), each with
// keywords. Entries carry the access they need and are filtered per viewer.

import { ADMIN_NAV } from "@/lib/admin/nav";
import {
  SETTINGS_SECTIONS,
  SETTINGS_SECTION_INFO,
  SETTING_ENTRIES,
  settingsHref,
} from "@/lib/settings/sections";

/** "admin": any school admin (the whole admin area). "superAdmin": platform staff only. */
export type AdminAccess = "admin" | "superAdmin";

export type SearchGroup = "Pages" | "Settings" | "Features";

export interface AdminSearchEntry {
  id: string;
  label: string;
  group: SearchGroup;
  /** Where it lives, shown beside the label (e.g. "Settings › Email intake"). */
  context?: string;
  href: string;
  /** Element id to scroll to and highlight after navigating. */
  anchor?: string;
  keywords: string[];
  access: AdminAccess;
}

export interface AdminViewer {
  isSuperAdmin: boolean;
}

export function canAccess(access: AdminAccess, viewer: AdminViewer): boolean {
  return access === "admin" || viewer.isSuperAdmin;
}

// Things inside a page worth jumping to directly. Paths are relative to the
// admin base; anchors are ids on that page.
const FEATURES: readonly {
  id: string;
  label: string;
  context: string;
  path: string;
  anchor?: string;
  keywords: string[];
}[] = [
  { id: "feature-flagged", label: "Flagged conversations", context: "Feedback", path: "/feedback", anchor: "flagged-conversations", keywords: ["flagged chats", "unhelpful", "thumbs down"] },
  { id: "feature-unanswered", label: "Unanswered questions", context: "Feedback", path: "/feedback", anchor: "unanswered-questions", keywords: ["couldn't answer", "gaps", "missing"] },
  { id: "feature-auto-sort-now", label: "Auto-sort documents now", context: "Documents", path: "/documents", anchor: "library-ai-toolbar", keywords: ["sort", "ai", "organize", "categorize"] },
  { id: "feature-auto-folder", label: "Auto-folder", context: "Documents", path: "/documents", anchor: "library-ai-toolbar", keywords: ["folders", "ai", "organize", "restructure"] },
  { id: "feature-categories", label: "Manage categories", context: "Documents", path: "/documents", anchor: "manage-categories", keywords: ["tags", "category"] },
  { id: "feature-folders", label: "Folders", context: "Documents", path: "/documents", anchor: "document-folders", keywords: ["folder tree", "unfiled"] },
  { id: "feature-pending-approvals", label: "Pending approvals", context: "Dashboard", path: "", anchor: "pending-approvals", keywords: ["approve users", "waiting"] },
];

export function buildAdminSearchIndex(slug: string, viewer: AdminViewer): AdminSearchEntry[] {
  const base = `/s/${slug}/admin`;
  const entries: AdminSearchEntry[] = [];

  for (const group of ADMIN_NAV) {
    for (const item of group.items) {
      entries.push({
        id: `page-${item.key}`,
        label: item.label,
        group: "Pages",
        context: group.label ?? undefined,
        href: `${base}${item.path}`,
        keywords: item.keywords ?? [],
        access: "admin",
      });
      for (const child of item.children ?? []) {
        // Settings sections are indexed below, with their descriptions.
        if (item.key === "settings") continue;
        const query = child.query ? `?${new URLSearchParams(child.query)}` : "";
        if (child.path === item.path && !query) continue;
        entries.push({
          id: `page-${child.key}`,
          label: child.label,
          group: "Pages",
          context: item.label,
          href: `${base}${child.path}${query}`,
          keywords: [],
          access: "admin",
        });
      }
    }
  }

  for (const section of SETTINGS_SECTIONS) {
    const info = SETTINGS_SECTION_INFO[section];
    entries.push({
      id: `settings-${section}`,
      label: info.label,
      group: "Pages",
      context: "Settings",
      href: settingsHref(slug, section),
      keywords: [...info.keywords, "settings"],
      access: "admin",
    });
  }

  for (const setting of SETTING_ENTRIES) {
    entries.push({
      id: setting.anchor,
      label: setting.label,
      group: "Settings",
      context: `Settings › ${SETTINGS_SECTION_INFO[setting.section].label}`,
      href: settingsHref(slug, setting.section, setting.anchor),
      anchor: setting.anchor,
      keywords: setting.keywords,
      access: "admin",
    });
  }

  for (const feature of FEATURES) {
    entries.push({
      id: feature.id,
      label: feature.label,
      group: "Features",
      context: feature.context,
      href: `${base}${feature.path}${feature.anchor ? `#${feature.anchor}` : ""}`,
      anchor: feature.anchor,
      keywords: feature.keywords,
      access: "admin",
    });
  }

  entries.push({
    id: "page-super-admin",
    label: "Super Admin console",
    group: "Pages",
    context: "All schools",
    href: "/super-admin",
    keywords: ["schools", "platform", "super admin"],
    access: "superAdmin",
  });

  return entries.filter((e) => canAccess(e.access, viewer));
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function scoreToken(token: string, label: string, haystack: string): number {
  if (label.startsWith(token)) return 6;
  if (` ${label}`.includes(` ${token}`)) return 4;
  if (label.includes(token)) return 3;
  if (` ${haystack}`.includes(` ${token}`)) return 2;
  if (haystack.includes(token)) return 1;
  return 0;
}

/**
 * Entries matching every word of `query` (in the label, context or keywords),
 * best first: label matches beat keyword matches, prefixes beat substrings,
 * and Pages come before Settings and Features on ties. Empty query → all
 * Pages, in sidebar order.
 */
export function searchAdmin(
  entries: readonly AdminSearchEntry[],
  query: string,
  limit = 20
): AdminSearchEntry[] {
  const tokens = normalize(query).split(" ").filter(Boolean);
  if (tokens.length === 0) {
    return entries.filter((e) => e.group === "Pages").slice(0, limit);
  }
  const groupRank: Record<SearchGroup, number> = { Pages: 0, Settings: 1, Features: 2 };

  return entries
    .map((entry, index) => {
      const label = normalize(entry.label);
      const haystack = normalize(
        [entry.label, entry.context ?? "", ...entry.keywords].join(" ")
      );
      let score = 0;
      for (const token of tokens) {
        const s = scoreToken(token, label, haystack);
        if (s === 0) return null;
        score += s;
      }
      if (label === tokens.join(" ")) score += 10;
      return { entry, score, index };
    })
    .filter((r): r is { entry: AdminSearchEntry; score: number; index: number } => r !== null)
    .sort(
      (a, b) =>
        b.score - a.score ||
        groupRank[a.entry.group] - groupRank[b.entry.group] ||
        a.index - b.index
    )
    .slice(0, limit)
    .map((r) => r.entry);
}
