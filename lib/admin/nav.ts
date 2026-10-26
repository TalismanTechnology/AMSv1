// The admin sidebar's structure: headed groups of pages, some with sub-pages.
// Paths are relative to /s/<slug>/admin. Icons are attached by the sidebar, by
// key, so this file stays plain data the search index and tests can use.

import {
  CONTENT_PAGES,
  CONTENT_PAGE_INFO,
  SETTINGS_SECTIONS,
  SETTINGS_SECTION_INFO,
} from "@/lib/settings/sections";

export interface AdminNavChild {
  key: string;
  label: string;
  /** e.g. "/documents"; "" is the dashboard. */
  path: string;
  /** Query params that must match for this child to be the active one. */
  query?: Record<string, string>;
  /** Active on sub-paths too, not just the exact path. */
  prefix?: boolean;
}

export interface AdminNavItem extends AdminNavChild {
  keywords?: string[];
  /** Key into the sidebar's badges (e.g. open conflicts). */
  badgeKey?: string;
  children?: AdminNavChild[];
}

export interface AdminNavGroup {
  key: string;
  /** Heading; null for the ungrouped top item. */
  label: string | null;
  items: AdminNavItem[];
}

export const ADMIN_NAV: readonly AdminNavGroup[] = [
  {
    key: "home",
    label: null,
    items: [{ key: "dashboard", label: "Dashboard", path: "", keywords: ["home", "overview"] }],
  },
  {
    key: "content",
    label: "Content",
    items: [
      {
        key: "documents",
        label: "Documents",
        path: "/documents",
        prefix: true,
        keywords: ["library", "files", "upload", "folders", "categories"],
        children: [
          { key: "documents-list", label: "Library", path: "/documents" },
          { key: "documents-map", label: "Sorting map", path: "/documents", query: { view: "map" } },
        ],
      },
      {
        key: "events",
        label: "Events",
        path: "/events",
        prefix: true,
        keywords: ["calendar", "schedule"],
        children: [
          { key: "events-calendar", label: "Calendar", path: "/events" },
          { key: "events-blackbaud", label: "Blackbaud review", path: "/events/blackbaud", prefix: true },
        ],
      },
      ...CONTENT_PAGES.map((page) => ({
        key: page,
        label: CONTENT_PAGE_INFO[page].label,
        path: CONTENT_PAGE_INFO[page].path,
        prefix: true,
        keywords: CONTENT_PAGE_INFO[page].keywords,
      })),
    ],
  },
  {
    key: "parents",
    label: "Parents",
    items: [
      { key: "insights", label: "Insights", path: "/insights", prefix: true, keywords: ["topics", "trends", "questions"] },
      { key: "feedback", label: "Feedback", path: "/feedback", prefix: true, keywords: ["flagged", "thumbs", "unanswered", "ratings"] },
      { key: "analytics", label: "Analytics", path: "/analytics", prefix: true, keywords: ["usage", "charts", "stats"] },
      { key: "users", label: "Users", path: "/users", prefix: true, keywords: ["parents", "admins", "roles", "people", "members"] },
    ],
  },
  {
    key: "review",
    label: "Review",
    items: [
      { key: "conflicts", label: "Conflicts", path: "/conflicts", prefix: true, badgeKey: "conflicts", keywords: ["contradictions", "disagree", "outdated"] },
      { key: "document-audit", label: "Doc Audit", path: "/document-audit", prefix: true, keywords: ["document audit", "quality", "stale"] },
      { key: "audit", label: "Audit Log", path: "/audit", prefix: true, keywords: ["history", "activity", "changes"] },
    ],
  },
  {
    key: "configure",
    label: "Configure",
    items: [
      {
        key: "settings",
        label: "Settings",
        path: "/settings",
        prefix: true,
        keywords: ["preferences", "configuration"],
        children: SETTINGS_SECTIONS.map((section) => ({
          key: `settings-${section}`,
          label: SETTINGS_SECTION_INFO[section].label,
          path: `/settings/${section}`,
          prefix: true,
        })),
      },
    ],
  },
];

function pathMatches(item: AdminNavChild, relPath: string): boolean {
  if (relPath === item.path) return true;
  return Boolean(item.prefix) && item.path !== "" && relPath.startsWith(`${item.path}/`);
}

function queryMatches(item: AdminNavChild, search: URLSearchParams): boolean {
  return Object.entries(item.query ?? {}).every(([k, v]) => search.get(k) === v);
}

/** pathname relative to the admin base ("/s/x/admin/events" → "/events"). */
export function adminRelativePath(pathname: string, adminBase: string): string {
  if (!pathname.startsWith(adminBase)) return pathname;
  const rest = pathname.slice(adminBase.length).replace(/\/$/, "");
  return rest;
}

/**
 * The active child of an item: among children whose path matches, one whose
 * required query matches wins; otherwise the match without a query (so
 * "Library" is active on /documents and "Sorting map" on /documents?view=map).
 * The most specific path wins, so /events/blackbaud isn't also "Calendar".
 */
export function activeNavChild(
  item: AdminNavItem,
  relPath: string,
  search: URLSearchParams
): AdminNavChild | null {
  const matching = (item.children ?? [])
    .filter((c) => pathMatches(c, relPath))
    .sort((a, b) => b.path.length - a.path.length);
  return (
    matching.find((c) => c.query && queryMatches(c, search)) ??
    matching.find((c) => !c.query) ??
    null
  );
}

export function isNavItemActive(item: AdminNavItem, relPath: string): boolean {
  return pathMatches(item, relPath);
}
