// Pure helpers for contact folders (public.contact_folders, migration 049):
// name cleaning, missing-migration detection, counts, search and grouping for
// the admin and parent Contacts pages. No Supabase or AI imports, so it is
// unit tested (folders.test.ts) and safe to import from client components.

import { isNotInstalledError, type MaybeDbError } from "@/lib/supabase/not-installed";
import { CONTACT_TOPIC_LABELS, isContactTopic, type ContactStatus } from "./directory";

export interface ContactFolder {
  id: string;
  name: string;
  sort_order: number;
}

/** Longest folder name kept (the table's CHECK allows 60). */
export const CONTACT_FOLDER_NAME_MAX = 60;

/** Shown in admin while migration 049 hasn't been applied. */
export const CONTACT_FOLDERS_MISSING_MESSAGE =
  "Contact folders need a database update (migration 049_contact_folders.sql). Contacts are shown in one list until then.";

/** What parents see contacts without a folder under. */
export const PARENT_UNFILED_LABEL = "Other";

/** Selection in the admin folder list: null = all contacts. */
export const UNFILED = "__unfiled" as const;
export type ContactFolderSelection = string | typeof UNFILED | null;

/**
 * Does this error mean contact_folders / school_contacts.folder_id doesn't
 * exist yet? Same codes as every other not-yet-migrated feature.
 */
export function isContactFoldersMissingError(error: MaybeDbError | null | undefined): boolean {
  return isNotInstalledError(error);
}

/**
 * Is this "school_contacts.folder_id doesn't exist" (049 not applied) rather
 * than the whole table missing (044)? 42703 / PGRST204 are the column codes.
 */
export function isMissingFolderColumnError(error: MaybeDbError | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  return !error.code && /folder_id/.test(error.message ?? "") && isNotInstalledError(error);
}

/** Collapse whitespace, trim, cut at a word boundary within the limit. */
export function cleanContactFolderName(name: unknown): string {
  const clean = String(name ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= CONTACT_FOLDER_NAME_MAX) return clean;
  const cut = clean.slice(0, CONTACT_FOLDER_NAME_MAX);
  const space = cut.lastIndexOf(" ");
  return (space > 20 ? cut.slice(0, space) : cut).trim();
}

export const folderKey = (name: string) => cleanContactFolderName(name).toLowerCase();

/** By sort_order, then name. */
export function sortContactFolders<F extends Pick<ContactFolder, "name" | "sort_order">>(
  folders: readonly F[]
): F[] {
  return [...folders].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name)
  );
}

// ── Counting, filtering, searching ─────────────────────────────────

type FiledContact = { folder_id?: string | null };

export interface ContactFolderCounts {
  total: number;
  unfiled: number;
  byFolder: Map<string, number>;
}

/** Contacts per folder; a folder_id that isn't a known folder counts as unfiled. */
export function contactFolderCounts(
  contacts: readonly FiledContact[],
  folders: readonly Pick<ContactFolder, "id">[]
): ContactFolderCounts {
  const known = new Set(folders.map((f) => f.id));
  const byFolder = new Map<string, number>();
  let unfiled = 0;
  for (const c of contacts) {
    if (c.folder_id && known.has(c.folder_id)) {
      byFolder.set(c.folder_id, (byFolder.get(c.folder_id) ?? 0) + 1);
    } else unfiled++;
  }
  return { total: contacts.length, unfiled, byFolder };
}

export function inFolder(
  contact: FiledContact,
  selection: ContactFolderSelection,
  knownFolderIds: ReadonlySet<string>
): boolean {
  if (selection === null) return true;
  const filed = !!contact.folder_id && knownFolderIds.has(contact.folder_id);
  if (selection === UNFILED) return !filed;
  return contact.folder_id === selection;
}

export interface SearchableContact {
  name: string;
  role: string;
  email?: string | null;
  topics: readonly string[];
}

/**
 * Does the contact match every word of the query? Looks at the name, role,
 * email, topic labels and any `extra` text (folder / division names).
 */
export function matchesContactSearch(
  contact: SearchableContact,
  query: string,
  extra: readonly (string | null | undefined)[] = []
): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const topics = contact.topics.map((t) =>
    isContactTopic(t) ? `${CONTACT_TOPIC_LABELS[t]} ${t.replace(/_/g, " ")}` : t
  );
  const haystack = [contact.name, contact.role, contact.email ?? "", ...topics, ...extra]
    .join(" \u0000 ")
    .toLowerCase();
  return words.every((w) => haystack.includes(w));
}

export type ContactStatusFilter = "all" | "approved" | "suggested";

export function matchesStatusFilter(
  contact: { status: ContactStatus },
  filter: ContactStatusFilter
): boolean {
  return filter === "all" ? contact.status !== "rejected" : contact.status === filter;
}

// ── Grouping for parents ───────────────────────────────────────────

export interface ContactGroup<C> {
  /** The folder's id; null for the "Other" group. */
  id: string | null;
  name: string;
  contacts: C[];
}

/**
 * Contacts grouped by folder in folder order, empty folders dropped, and the
 * contacts without a (known) folder last under "Other". With no folders at
 * all (049 not applied, or none made yet) everything is one "Other" group —
 * the caller may show it without a heading.
 */
export function groupContactsByFolder<C extends FiledContact>(
  contacts: readonly C[],
  folders: readonly ContactFolder[],
  unfiledLabel = PARENT_UNFILED_LABEL
): ContactGroup<C>[] {
  const byId = new Map<string, C[]>();
  const other: C[] = [];
  const known = new Set(folders.map((f) => f.id));
  for (const c of contacts) {
    if (c.folder_id && known.has(c.folder_id)) {
      const list = byId.get(c.folder_id) ?? [];
      list.push(c);
      byId.set(c.folder_id, list);
    } else other.push(c);
  }
  const groups: ContactGroup<C>[] = sortContactFolders(folders)
    .filter((f) => byId.has(f.id))
    .map((f) => ({ id: f.id, name: f.name, contacts: byId.get(f.id)! }));
  if (other.length) groups.push({ id: null, name: unfiledLabel, contacts: other });
  return groups;
}

/** "Jane Smith" → "JS"; falls back to the role, then "?". */
export function contactInitials(contact: { name: string; role: string }): string {
  const source = contact.name.trim() || contact.role.trim();
  const words = source.split(/[\s\-–—]+/).filter((w) => /[a-z0-9]/i.test(w));
  if (!words.length) return "?";
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return (first + last).toUpperCase();
}
