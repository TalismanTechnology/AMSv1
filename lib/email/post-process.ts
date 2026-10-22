import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { applySorting, chooseSorting } from "@/lib/documents/auto-sort";
import { protectedFolderIds } from "@/lib/documents/auto-folder";

// What a caller that can't look at the library itself (the manual endpoint's
// scheduled job) needs once ingestion returns: did each document finish
// processing, and which folder is it in.

export interface ProcessedState {
  documentId: string;
  /** "ready", "error", or "processing" when the wait ran out. */
  status: string;
  chunks: number;
  error?: string | null;
}

type Db = Pick<SupabaseClient, "from">;

const POLL_MS = 2000;

/**
 * Wait until none of the documents is still processing, or the deadline
 * (epoch ms) passes. Ingestion has already awaited processing (in-process,
 * or the process-document function), so this usually returns on the first read.
 */
export async function waitForProcessing(
  documentIds: string[],
  deadline: number,
  db: Db = createAdminClient(),
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))
): Promise<ProcessedState[]> {
  if (!documentIds.length) return [];
  for (;;) {
    const { data, error } = await db
      .from("documents")
      .select("id, status, error_message")
      .in("id", documentIds);
    if (error) throw new Error(`Could not read document status: ${error.message}`);
    const rows = (data ?? []) as { id: string; status: string; error_message: string | null }[];
    const pending = rows.some((r) => r.status === "processing");
    if (!pending || Date.now() + POLL_MS > deadline) {
      return Promise.all(
        documentIds.map(async (id) => {
          const row = rows.find((r) => r.id === id);
          const { count } = await db
            .from("document_chunks")
            .select("id", { count: "exact", head: true })
            .eq("document_id", id);
          return {
            documentId: id,
            status: row?.status ?? "missing",
            chunks: count ?? 0,
            error: row?.error_message ?? null,
          };
        })
      );
    }
    await sleep(POLL_MS);
  }
}

/** Ready with at least one chunk: searchable in chat. */
export const isProcessed = (s: ProcessedState) => s.status === "ready" && s.chunks > 0;

export interface FolderResult {
  folderId: string | null;
  folder: string | null;
  /** Why the document was left unfiled. */
  note?: string;
}

/**
 * Give a processed document a library folder if it has none. Auto-sort in
 * processDocument usually has, but it leaves the folder empty when the
 * school's auto-sort is off, when its only folders are ones auto-sort never
 * offers (Website/Responses), or when the model answers "none fit". This runs
 * the same chooseSorting on the school's existing folders, never Website or
 * Responses or anything under them, never creates one, and writes only an
 * empty folder_id. Never throws: on failure the document stays unfiled and
 * the reason is returned.
 */
export async function ensureDocumentFolder(
  documentId: string,
  db: SupabaseClient = createAdminClient(),
  choose: typeof chooseSorting = chooseSorting
): Promise<FolderResult> {
  try {
    const { data: doc, error: docError } = await db
      .from("documents")
      .select("id, title, school_id, category_id, folder_id, source, summary, text_url")
      .eq("id", documentId)
      .single();
    if (docError || !doc) throw new Error(`document lookup failed: ${docError?.message ?? "not found"}`);
    const { data: folders, error: folderError } = await db
      .from("folders")
      .select("id, name, parent_id")
      .eq("school_id", doc.school_id);
    if (folderError) throw new Error(`folder lookup failed: ${folderError.message}`);

    const names = new Map((folders ?? []).map((f) => [f.id as string, f.name as string]));
    if (doc.folder_id) {
      return { folderId: doc.folder_id, folder: names.get(doc.folder_id) ?? null };
    }

    let content: string = doc.summary ?? "";
    if (!content.trim() && doc.text_url) {
      const { data } = await db.storage.from("documents").download(doc.text_url);
      if (data) content = (await data.text()).slice(0, 6000);
    }
    const choice = await choose(db, doc, content.trim() || doc.title);
    // chooseSorting already leaves Website/Responses out for email documents;
    // checked again so mail can never be filed there.
    const locked = protectedFolderIds(folders ?? []);
    if (choice.folder_id && locked.has(choice.folder_id)) delete choice.folder_id;
    if (!choice.folder_id) {
      const usable = (folders ?? []).some((f) => !locked.has(f.id));
      return {
        folderId: null,
        folder: null,
        note: usable ? "AI found no fitting folder" : "school has no folder outside Website/Responses",
      };
    }
    const { folderId } = await applySorting(db, documentId, choice);
    if (!folderId) {
      return { folderId: null, folder: null, note: "folder was set by someone else meanwhile" };
    }
    return { folderId, folder: names.get(folderId) ?? null };
  } catch (err) {
    return {
      folderId: null,
      folder: null,
      note: `folder sort failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
