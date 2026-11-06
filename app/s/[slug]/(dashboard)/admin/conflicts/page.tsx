import { redirect } from "next/navigation";
import { requireSchoolContext } from "@/lib/school-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { isNotInstalledError } from "@/lib/supabase/not-installed";
import { formatChunkLocation, type ChunkMetadata } from "@/lib/ai/rag";
import { excerptAround, quoteAppearsIn } from "@/lib/conflicts/quotes";
import { CONFLICTS_NOT_INSTALLED_MESSAGE } from "@/lib/conflicts/store";
import { latestScanRun } from "@/lib/conflicts/scan";
import { PageTransition } from "@/components/motion";
import { ConflictsClient, type ConflictView, type ConflictSideView, type ConflictsPageData } from "./client";

// "Scan for conflicts" (a server action on this page) keeps scanning after it
// responds, via after(); that work counts against this limit.
export const maxDuration = 300;

const LIST_LIMIT = 100;

interface DocEmbed {
  title: string | null;
  file_name: string | null;
  file_type: string | null;
  file_url: string | null;
  source: string | null;
  source_url: string | null;
  created_at: string | null;
  updated_at: string | null;
  email_meta: { date?: unknown } | null;
  divisions: { name: string | null }[] | null;
}

interface ChunkEmbed {
  content: string | null;
  metadata: ChunkMetadata | null;
}

interface ConflictRow {
  id: string;
  status: ConflictView["status"];
  resolution: ConflictView["resolution"];
  admin_note: string | null;
  topic: string | null;
  description: string | null;
  confidence: number | null;
  similarity: number;
  created_at: string;
  resolved_at: string | null;
  document_a_id: string;
  document_b_id: string;
  chunk_a_index: number;
  chunk_b_index: number;
  chunk_a_page: number | null;
  chunk_b_page: number | null;
  statement_a: string | null;
  statement_b: string | null;
  excerpt_a: string | null;
  excerpt_b: string | null;
  document_a: DocEmbed | DocEmbed[] | null;
  document_b: DocEmbed | DocEmbed[] | null;
  chunk_a: ChunkEmbed | ChunkEmbed[] | null;
  chunk_b: ChunkEmbed | ChunkEmbed[] | null;
}

const DOC_FULL =
  "title, file_name, file_type, file_url, source, source_url, created_at, updated_at, email_meta, divisions:event_calendars(name)";
const DOC_BASIC = "title, file_name, file_type, file_url, source, created_at, updated_at";
const columnsFor = (doc: string) => `id, status, resolution, admin_note, topic, description, confidence, similarity,
  created_at, resolved_at, document_a_id, document_b_id, chunk_a_index, chunk_b_index,
  chunk_a_page, chunk_b_page, statement_a, statement_b, excerpt_a, excerpt_b,
  document_a:documents!document_conflicts_document_a_id_fkey(${doc}),
  document_b:documents!document_conflicts_document_b_id_fkey(${doc}),
  chunk_a:document_chunks!document_conflicts_chunk_a_id_fkey(content, metadata),
  chunk_b:document_chunks!document_conflicts_chunk_b_id_fkey(content, metadata)`;

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

function toSide(row: ConflictRow, which: "a" | "b"): ConflictSideView {
  const doc = one(which === "a" ? row.document_a : row.document_b);
  const chunk = one(which === "a" ? row.chunk_a : row.chunk_b);
  const statement = which === "a" ? row.statement_a : row.statement_b;
  const page = which === "a" ? row.chunk_a_page : row.chunk_b_page;
  const stored = which === "a" ? row.excerpt_a : row.excerpt_b;
  // The chunk is gone once its document was re-processed: show the text as
  // it was judged. A quote that runs across a chunk seam is only whole in the
  // stored excerpt (the chunk and its neighbour, stitched): show that.
  const acrossSeam =
    !!statement &&
    !!chunk?.content &&
    !quoteAppearsIn(statement, chunk.content) &&
    !!stored &&
    quoteAppearsIn(statement, stored);
  const text = (acrossSeam ? stored : chunk?.content) ?? stored ?? statement ?? "";
  const emailDate = typeof doc?.email_meta?.date === "string" ? doc.email_meta.date : null;
  return {
    documentId: which === "a" ? row.document_a_id : row.document_b_id,
    title: doc?.title || "Untitled document",
    fileName: doc?.file_name ?? doc?.title ?? "",
    fileType: doc?.file_type ?? "txt",
    fileUrl: doc?.file_url ?? undefined,
    source: doc?.source ?? null,
    sourceUrl: doc?.source_url ?? null,
    page,
    location: formatChunkLocation(chunk?.metadata ?? (page != null ? { page } : null))?.label ?? null,
    statement,
    excerpt: excerptAround(text, statement),
    createdAt: doc?.created_at ?? null,
    updatedAt: doc?.updated_at ?? null,
    emailDate,
    divisions: (doc?.divisions ?? []).map((d) => d.name).filter((n): n is string => !!n),
  };
}

function toView(row: ConflictRow): ConflictView {
  return {
    id: row.id,
    status: row.status,
    resolution: row.resolution,
    adminNote: row.admin_note,
    topic: row.topic,
    description: row.description,
    confidence: row.confidence,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    a: toSide(row, "a"),
    b: toSide(row, "b"),
  };
}

async function loadConflicts(schoolId: string): Promise<ConflictsPageData> {
  // Admin client: chunk text sits behind document_chunks' own policies. Every
  // query is scoped to this school, and the layout and the check below only
  // let this school's admins (and super admins) in.
  const supabase = createAdminClient();
  const queryLists = (doc: string) =>
    Promise.all([
      supabase
        .from("document_conflicts")
        .select(columnsFor(doc))
        .eq("school_id", schoolId)
        .eq("status", "open")
        .order("confidence", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(LIST_LIMIT)
        .returns<ConflictRow[]>(),
      supabase
        .from("document_conflicts")
        .select(columnsFor(doc))
        .eq("school_id", schoolId)
        .in("status", ["resolved", "dismissed"])
        .order("resolved_at", { ascending: false })
        .limit(LIST_LIMIT)
        .returns<ConflictRow[]>(),
    ]);
  const [[firstOpen, firstReviewed], scan] = await Promise.all([
    queryLists(DOC_FULL),
    latestScanRun(supabase, schoolId),
  ]);
  const [open, reviewed] =
    (firstOpen.error && !isNotInstalledError(firstOpen.error)) ||
    (firstReviewed.error && !isNotInstalledError(firstReviewed.error))
      ? await queryLists(DOC_BASIC)
      : [firstOpen, firstReviewed];

  const notInstalled =
    !scan.installed || isNotInstalledError(open.error) || isNotInstalledError(reviewed.error);
  if (notInstalled) {
    return { installed: false, open: [], reviewed: [], lastRun: null, loadError: CONFLICTS_NOT_INSTALLED_MESSAGE };
  }
  const error = open.error ?? reviewed.error;
  if (error) console.error("[conflicts] Loading conflicts failed:", error.message);

  return {
    installed: true,
    open: (open.data ?? []).map(toView),
    reviewed: (reviewed.data ?? []).map(toView),
    lastRun: scan.run,
    loadError: error ? "Conflicts couldn't be loaded." : null,
  };
}

export default async function ConflictsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { school, role, isSuperAdmin } = await requireSchoolContext(slug);
  if (role !== "admin" && !isSuperAdmin) redirect(`/s/${slug}/parent/chat`);

  const data = await loadConflicts(school.id);

  return (
    <PageTransition>
      <ConflictsClient schoolId={school.id} data={data} />
    </PageTransition>
  );
}
