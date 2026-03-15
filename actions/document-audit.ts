"use server";

import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import {
  analyzeDocumentGaps,
  type AuditResult,
  type DocumentInput,
} from "@/lib/ai/document-audit";

export interface StoredAudit {
  id: string;
  school_id: string;
  gaps: AuditResult;
  overall_score: number | null;
  summary: string | null;
  document_count: number;
  created_at: string;
  created_by: string | null;
}

export async function runDocumentAudit(schoolId: string): Promise<StoredAudit> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Fetch documents with category and folder names
  const { data: documents } = await supabase
    .from("documents")
    .select("title, description, summary, tags, file_type, category_id, folder_id")
    .eq("school_id", schoolId)
    .eq("status", "ready");

  // Fetch categories and folders for lookup
  const [{ data: categories }, { data: folders }, { data: school }] =
    await Promise.all([
      supabase.from("categories").select("id, name").eq("school_id", schoolId),
      supabase.from("folders").select("id, name").eq("school_id", schoolId),
      supabase.from("schools").select("name").eq("id", schoolId).single(),
    ]);

  const categoryMap = new Map((categories || []).map((c) => [c.id, c.name]));
  const folderMap = new Map((folders || []).map((f) => [f.id, f.name]));

  const docInputs: DocumentInput[] = (documents || []).map((d) => ({
    title: d.title,
    description: d.description,
    summary: d.summary,
    category: d.category_id ? categoryMap.get(d.category_id) || null : null,
    folder: d.folder_id ? folderMap.get(d.folder_id) || null : null,
    tags: d.tags,
    file_type: d.file_type,
  }));

  // Run AI analysis against checklist
  const result = await analyzeDocumentGaps(
    docInputs,
    school?.name || "Unknown School"
  );

  // Store result
  const { data: audit, error } = await supabase
    .from("document_audits")
    .insert({
      school_id: schoolId,
      gaps: result as unknown as Record<string, unknown>,
      overall_score: result.overallScore,
      summary: result.summary,
      document_count: docInputs.length,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to store audit: ${error.message}`);

  logAudit(
    user.id,
    "run_document_audit",
    "document_audit",
    audit.id,
    {
      totalItems: result.totalItems,
      totalCovered: result.totalCovered,
      overallScore: result.overallScore,
      documentCount: docInputs.length,
    },
    schoolId
  );

  revalidatePath("/", "layout");

  return audit as StoredAudit;
}

export async function getLatestAudit(
  schoolId: string
): Promise<StoredAudit | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("document_audits")
    .select("*")
    .eq("school_id", schoolId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  return (data as StoredAudit) || null;
}
