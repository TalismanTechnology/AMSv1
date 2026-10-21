import type { SupabaseClient } from "@supabase/supabase-js";
import { isNotInstalledError } from "@/lib/supabase/not-installed";
import type { ResolvedConflict, ResolvedConflictSide, ConflictResolution } from "./resolutions";

// Reads of document_conflicts shared by the chat turn, the admin page and the
// nav badge. Every reader treats a missing table (migration 046 not applied)
// as "no conflicts".

export const CONFLICTS_NOT_INSTALLED_MESSAGE =
  "Conflict detection needs a database update (migration 046_document_conflicts.sql).";

export type ConflictStatus = "open" | "resolved" | "dismissed" | "auto_dismissed";

interface EmbeddedDocument {
  title: string | null;
  file_url: string | null;
  file_type: string | null;
  source: string | null;
  source_url: string | null;
}

const DOCUMENT_COLUMNS = "title, file_url, file_type, source, source_url";

const RESOLVED_COLUMNS = `id, status, resolution, admin_note, resolved_at,
  chunk_a_id, chunk_b_id, document_a_id, document_b_id,
  chunk_a_index, chunk_b_index, chunk_a_page, chunk_b_page,
  statement_a, statement_b,
  document_a:documents!document_conflicts_document_a_id_fkey(${DOCUMENT_COLUMNS}),
  document_b:documents!document_conflicts_document_b_id_fkey(${DOCUMENT_COLUMNS})`;

interface ResolvedRow {
  id: string;
  status: string;
  resolution: ConflictResolution | null;
  admin_note: string | null;
  resolved_at: string | null;
  chunk_a_id: string | null;
  chunk_b_id: string | null;
  document_a_id: string;
  document_b_id: string;
  chunk_a_index: number;
  chunk_b_index: number;
  chunk_a_page: number | null;
  chunk_b_page: number | null;
  statement_a: string | null;
  statement_b: string | null;
  document_a: EmbeddedDocument | EmbeddedDocument[] | null;
  document_b: EmbeddedDocument | EmbeddedDocument[] | null;
}

const one = <T>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

function side(
  row: ResolvedRow,
  which: "a" | "b"
): ResolvedConflictSide {
  const doc = one(which === "a" ? row.document_a : row.document_b);
  return {
    chunk_id: which === "a" ? row.chunk_a_id : row.chunk_b_id,
    document_id: which === "a" ? row.document_a_id : row.document_b_id,
    chunk_index: which === "a" ? row.chunk_a_index : row.chunk_b_index,
    page: which === "a" ? row.chunk_a_page : row.chunk_b_page,
    statement: which === "a" ? row.statement_a : row.statement_b,
    document_title: doc?.title || "Untitled document",
    file_url: doc?.file_url ?? undefined,
    file_type: doc?.file_type ?? undefined,
    source: doc?.source ?? undefined,
    source_url: doc?.source_url ?? undefined,
  };
}

/**
 * The school's RESOLVED conflicts with a side in any of these documents, in
 * one query. Never throws: not installed, or any error, means none (the chat
 * then answers exactly as it would without conflicts).
 */
export async function loadResolvedConflicts(
  supabase: SupabaseClient,
  schoolId: string,
  documentIds: string[]
): Promise<ResolvedConflict[]> {
  const ids = [...new Set(documentIds)].filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (ids.length === 0) return [];
  try {
    const list = ids.join(",");
    const { data, error } = await supabase
      .from("document_conflicts")
      .select(RESOLVED_COLUMNS)
      .eq("school_id", schoolId)
      .eq("status", "resolved")
      .or(`document_a_id.in.(${list}),document_b_id.in.(${list})`)
      .order("resolved_at", { ascending: false })
      .limit(200)
      .returns<ResolvedRow[]>();
    if (error) {
      if (!isNotInstalledError(error)) {
        console.error("[conflicts] Loading resolved conflicts failed (ignoring):", error.message);
      }
      return [];
    }
    return (data ?? []).map((row) => ({
      id: row.id,
      status: row.status,
      resolution: row.resolution,
      admin_note: row.admin_note,
      resolved_at: row.resolved_at,
      a: side(row, "a"),
      b: side(row, "b"),
    }));
  } catch (err) {
    console.error("[conflicts] Loading resolved conflicts failed (ignoring):", err);
    return [];
  }
}

/**
 * Open conflicts for the admin nav badge: a head-only count. Null when the
 * feature isn't installed or the count fails — the nav then shows no badge.
 */
export async function countOpenConflicts(
  supabase: SupabaseClient,
  schoolId: string
): Promise<number | null> {
  try {
    const { count, error } = await supabase
      .from("document_conflicts")
      .select("id", { count: "exact", head: true })
      .eq("school_id", schoolId)
      .eq("status", "open");
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}
