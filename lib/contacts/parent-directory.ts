import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingTableError } from "./directory";
import {
  isContactFoldersMissingError,
  isMissingFolderColumnError,
  sortContactFolders,
  type ContactFolder,
} from "./folders";

// What a parent's Contacts page may show: the school's APPROVED contacts and
// the school's folder names. Always called with the signed-in user's client
// (lib/supabase/server createClient), never the service role, so RLS (044:
// members read approved rows only) applies on top of the explicit filter
// here; anything not approved that still came back is dropped again below.

/** The only columns a parent ever receives — no source excerpts or ids of documents. */
export interface ParentContact {
  id: string;
  name: string;
  role: string;
  email: string | null;
  phone: string | null;
  division_id: string | null;
  topics: string[];
  folder_id: string | null;
}

export interface ParentContactsResult {
  contacts: ParentContact[];
  folders: ContactFolder[];
}

const BASE_COLUMNS = "id, name, role, email, phone, division_id, topics, status";

type Row = Omit<ParentContact, "folder_id"> & { status?: string; folder_id?: string | null };

/**
 * Keep only approved rows that a parent can actually reach, reduced to the
 * parent-visible columns. Pure; the defence-in-depth half of
 * loadParentContacts.
 */
export function parentVisibleContacts(rows: readonly Row[]): ParentContact[] {
  return rows
    .filter((r) => r.status === "approved" && !!(r.email?.trim() || r.phone?.trim()))
    .map((r) => ({
      id: r.id,
      name: r.name ?? "",
      role: r.role ?? "",
      email: r.email?.trim() || null,
      phone: r.phone?.trim() || null,
      division_id: r.division_id ?? null,
      topics: r.topics ?? [],
      folder_id: r.folder_id ?? null,
    }));
}

/**
 * The school's approved contacts and its contact folders, for parents.
 * Degrades rather than fails: without migration 044 there are no contacts,
 * and without 049 the contacts come back unfiled with no folders.
 */
export async function loadParentContacts(
  supabase: SupabaseClient,
  schoolId: string
): Promise<ParentContactsResult> {
  const contactsQuery = (columns: string) =>
    supabase
      .from("school_contacts")
      .select(columns)
      .eq("school_id", schoolId)
      .eq("status", "approved")
      .order("name", { ascending: true });

  const [withFolders, foldersResult] = await Promise.all([
    contactsQuery(`${BASE_COLUMNS}, folder_id`),
    supabase
      .from("contact_folders")
      .select("id, name, sort_order")
      .eq("school_id", schoolId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
  ]);

  let { data, error } = withFolders;
  // 049 not applied: folder_id doesn't exist yet; ask again without it.
  if (error && isMissingFolderColumnError(error)) {
    ({ data, error } = await contactsQuery(BASE_COLUMNS));
  }
  if (error) {
    if (!isMissingTableError(error)) {
      console.error("[contacts] Loading parent contacts failed:", error.message);
    }
    return { contacts: [], folders: [] };
  }

  let folders: ContactFolder[] = [];
  if (foldersResult.error) {
    if (!isContactFoldersMissingError(foldersResult.error)) {
      console.error("[contacts] Loading contact folders failed:", foldersResult.error.message);
    }
  } else {
    folders = sortContactFolders((foldersResult.data ?? []) as ContactFolder[]);
  }

  return { contacts: parentVisibleContacts((data ?? []) as unknown as Row[]), folders };
}
