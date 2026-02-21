"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";

// --- Auth guard ---

async function requireAdmin(schoolId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Check if user is a super_admin via profiles
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role === "super_admin") return user;

  // Check school_memberships for admin role
  const { data: membership } = await supabase
    .from("school_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("school_id", schoolId)
    .single();

  if (!membership || membership.role !== "admin") {
    throw new Error("Not authorized");
  }

  return user;
}

// --- Bulk generation ---

export interface BulkDocumentRow {
  title: string;
  description: string;
  file_name: string;
  file_type: string;
  tags: string[];
  category_id?: string | null;
  folder_id?: string | null;
}

export async function generateBulkDocuments(
  schoolId: string,
  rows: BulkDocumentRow[]
) {
  const user = await requireAdmin(schoolId);
  const admin = createAdminClient();

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  let inserted = 0;

  for (const row of rows) {
    try {
      // Generate realistic content with AI
      const { text: content } = await generateText({
        model: google("gemini-2.0-flash"),
        prompt: `Generate a realistic school document with the following details:
Title: ${row.title}
Description: ${row.description}

Write 500-1000 words of realistic, professional content for this school document.
Include appropriate sections, formatting, and details that a real school would include.
Do not include any markdown formatting — just plain text with line breaks.
Do not include any preamble or explanation — just the document content.`,
      });

      // Upload as .txt file to Supabase Storage
      const fileName = row.file_name.replace(/\.[^.]+$/, ".txt");
      const storagePath = `${schoolId}/${Date.now()}-${Math.random().toString(36).slice(2)}-${fileName}`;
      const fileBuffer = Buffer.from(content, "utf-8");

      const { error: uploadError } = await admin.storage
        .from("documents")
        .upload(storagePath, fileBuffer, {
          contentType: "text/plain",
          upsert: false,
        });

      if (uploadError) {
        console.error(`Upload failed for ${row.title}:`, uploadError.message);
        continue;
      }

      // Insert document record
      const { data: doc, error: insertError } = await admin
        .from("documents")
        .insert({
          title: row.title,
          description: row.description,
          file_name: fileName,
          file_type: "txt",
          file_url: storagePath,
          file_size: fileBuffer.length,
          category_id: row.category_id || null,
          folder_id: row.folder_id || null,
          tags: row.tags,
          status: "processing" as const,
          uploaded_by: user.id,
          school_id: schoolId,
        })
        .select("id")
        .single();

      if (insertError || !doc) {
        console.error(`Insert failed for ${row.title}:`, insertError?.message);
        continue;
      }

      // Trigger processing (chunking + embedding) — fire and forget
      fetch(`${baseUrl}/api/process-document`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: doc.id, schoolId }),
      }).catch(() => {});

      inserted++;
    } catch (err) {
      console.error(`Failed to generate ${row.title}:`, err);
    }
  }

  logAudit(user.id, "dev_generate_documents", "document", undefined, { count: inserted }, schoolId);
  revalidatePath("/", "layout");

  if (inserted === 0 && rows.length > 0) {
    return { success: false, count: 0, error: "All documents failed to generate" };
  }

  return { success: true, count: inserted, error: inserted < rows.length ? `${rows.length - inserted} documents failed` : undefined };
}

export interface BulkEventRow {
  title: string;
  description: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  event_type: string;
}

export async function generateBulkEvents(
  schoolId: string,
  rows: BulkEventRow[]
) {
  const user = await requireAdmin(schoolId);
  const admin = createAdminClient();

  const insertRows = rows.map((r) => ({
    ...r,
    recurrence: "none",
    recurrence_end: null,
    created_by: user.id,
    school_id: schoolId,
  }));

  for (let i = 0; i < insertRows.length; i += 50) {
    const batch = insertRows.slice(i, i + 50);
    const { error } = await admin.from("events").insert(batch);
    if (error) return { error: error.message, inserted: i };
  }

  logAudit(user.id, "dev_generate_events", "event", undefined, { count: rows.length }, schoolId);
  revalidatePath("/", "layout");
  return { success: true, count: rows.length };
}

export interface BulkAnnouncementRow {
  title: string;
  content: string;
  priority: string;
  pinned: boolean;
  status: string;
}

export async function generateBulkAnnouncements(
  schoolId: string,
  rows: BulkAnnouncementRow[]
) {
  const user = await requireAdmin(schoolId);
  const admin = createAdminClient();

  const insertRows = rows.map((r) => ({
    ...r,
    expires_at: null,
    publish_at: null,
    created_by: user.id,
    school_id: schoolId,
  }));

  for (let i = 0; i < insertRows.length; i += 50) {
    const batch = insertRows.slice(i, i + 50);
    const { error } = await admin.from("announcements").insert(batch);
    if (error) return { error: error.message, inserted: i };
  }

  logAudit(user.id, "dev_generate_announcements", "announcement", undefined, { count: rows.length }, schoolId);
  revalidatePath("/", "layout");
  return { success: true, count: rows.length };
}

export interface BulkCategoryRow {
  name: string;
  description: string | null;
  color: string;
}

export async function generateBulkCategories(
  schoolId: string,
  rows: BulkCategoryRow[]
): Promise<{ success: boolean; ids?: string[]; error?: string }> {
  const user = await requireAdmin(schoolId);
  const admin = createAdminClient();

  const insertRows = rows.map((r) => ({
    ...r,
    school_id: schoolId,
  }));

  const { data, error } = await admin
    .from("categories")
    .upsert(insertRows, { onConflict: "name,school_id", ignoreDuplicates: true })
    .select("id");

  if (error) return { success: false, error: error.message };

  // Also fetch any existing categories with these names
  const { data: allCats } = await admin
    .from("categories")
    .select("id")
    .eq("school_id", schoolId)
    .in("name", rows.map((r) => r.name));

  logAudit(user.id, "dev_generate_categories", "category", undefined, { count: rows.length }, schoolId);
  revalidatePath("/", "layout");
  return { success: true, ids: (allCats || data || []).map((c) => c.id) };
}

export interface BulkFolderRow {
  name: string;
  parent_id?: string | null;
}

export async function generateBulkFolders(
  schoolId: string,
  rows: BulkFolderRow[]
): Promise<{ success: boolean; ids?: string[]; error?: string }> {
  const user = await requireAdmin(schoolId);
  const admin = createAdminClient();

  // Insert root folders first (no parent_id)
  const rootRows = rows.filter((r) => !r.parent_id);
  const childRows = rows.filter((r) => r.parent_id);

  const insertRoots = rootRows.map((r) => ({
    name: r.name,
    parent_id: null,
    school_id: schoolId,
  }));

  const allIds: string[] = [];

  if (insertRoots.length > 0) {
    const { data, error } = await admin
      .from("folders")
      .upsert(insertRoots, { onConflict: "name,parent_id,school_id", ignoreDuplicates: true })
      .select("id");

    if (error) return { success: false, error: error.message };

    // Also fetch existing ones
    const { data: existing } = await admin
      .from("folders")
      .select("id, name")
      .eq("school_id", schoolId)
      .is("parent_id", null);

    allIds.push(...(existing || data || []).map((f) => f.id));
  }

  if (childRows.length > 0) {
    const insertChildren = childRows.map((r) => ({
      name: r.name,
      parent_id: r.parent_id,
      school_id: schoolId,
    }));

    const { data, error } = await admin
      .from("folders")
      .upsert(insertChildren, { onConflict: "name,parent_id,school_id", ignoreDuplicates: true })
      .select("id");

    if (error) return { success: false, error: error.message };
    allIds.push(...(data || []).map((f) => f.id));
  }

  logAudit(user.id, "dev_generate_folders", "folder", undefined, { count: rows.length }, schoolId);
  revalidatePath("/", "layout");
  return { success: true, ids: allIds };
}

// --- Cleanup ---

const ALLOWED_CLEAR_TABLES = [
  "documents",
  "events",
  "announcements",
  "categories",
  "folders",
  "document_chunks",
  "chat_sessions",
  "chat_messages",
  "analytics_events",
  "audit_log",
  "notifications",
  "announcement_dismissals",
  "chat_feedback",
] as const;

export async function clearTable(tableName: string, schoolId: string) {
  const user = await requireAdmin(schoolId);
  const admin = createAdminClient();

  if (!ALLOWED_CLEAR_TABLES.includes(tableName as typeof ALLOWED_CLEAR_TABLES[number])) {
    return { error: `Table "${tableName}" is not allowed to be cleared` };
  }

  // Handle FK dependencies
  if (tableName === "documents") {
    await admin.from("document_chunks").delete().eq("school_id", schoolId);
    await admin.from("documents").delete().eq("school_id", schoolId);
  } else if (tableName === "chat_sessions") {
    await admin.from("chat_feedback").delete().eq("school_id", schoolId);
    await admin.from("chat_messages").delete().eq("school_id", schoolId);
    await admin.from("chat_sessions").delete().eq("school_id", schoolId);
  } else if (tableName === "announcements") {
    await admin.from("announcement_dismissals").delete().eq(
      "announcement_id",
      admin.from("announcements").select("id").eq("school_id", schoolId)
    );
    // Simpler approach: just delete announcements, cascade should handle dismissals
    await admin.from("announcements").delete().eq("school_id", schoolId);
  } else {
    await admin.from(tableName).delete().eq("school_id", schoolId);
  }

  logAudit(user.id, "dev_clear_table", tableName, undefined, undefined, schoolId);
  revalidatePath("/", "layout");
  return { success: true };
}

export async function clearAllTestData(schoolId: string) {
  const user = await requireAdmin(schoolId);
  const admin = createAdminClient();

  // Order matters for foreign keys
  const tables = [
    "chat_feedback",
    "document_chunks",
    "chat_messages",
    "chat_sessions",
    "analytics_events",
    "audit_log",
    "notifications",
    "announcement_dismissals",
    "documents",
    "announcements",
    "events",
    "categories",
    "folders",
  ];

  for (const table of tables) {
    await admin.from(table).delete().eq("school_id", schoolId);
  }

  logAudit(user.id, "dev_clear_all", "all", undefined, undefined, schoolId);
  revalidatePath("/", "layout");
  return { success: true };
}

export async function purgeDocumentChunks(schoolId: string) {
  const user = await requireAdmin(schoolId);
  const admin = createAdminClient();

  await admin.from("document_chunks").delete().eq("school_id", schoolId);

  logAudit(user.id, "dev_purge_chunks", "document_chunks", undefined, undefined, schoolId);
  revalidatePath("/", "layout");
  return { success: true };
}

// --- Debug info ---

export async function getDebugInfo(schoolId: string) {
  await requireAdmin(schoolId);
  const admin = createAdminClient();

  const tables = [
    "profiles",
    "documents",
    "document_chunks",
    "events",
    "announcements",
    "categories",
    "folders",
    "chat_sessions",
    "chat_messages",
    "analytics_events",
    "audit_log",
    "notifications",
  ] as const;

  const counts: Record<string, number> = {};
  for (const table of tables) {
    // profiles don't have school_id, use a different query
    if (table === "profiles") {
      const { count } = await admin
        .from(table)
        .select("*", { count: "exact", head: true });
      counts[table] = count || 0;
    } else {
      const { count } = await admin
        .from(table)
        .select("*", { count: "exact", head: true })
        .eq("school_id", schoolId);
      counts[table] = count || 0;
    }
  }

  // Embedding stats
  const { data: chunkDocs } = await admin
    .from("document_chunks")
    .select("document_id")
    .eq("school_id", schoolId);

  const docIds = new Set(chunkDocs?.map((c) => c.document_id) || []);
  const totalChunks = chunkDocs?.length || 0;
  const avgChunksPerDoc = docIds.size > 0 ? Math.round(totalChunks / docIds.size) : 0;

  // Recent errors
  const { data: recentErrors } = await admin
    .from("documents")
    .select("id, title, error_message, updated_at")
    .eq("school_id", schoolId)
    .eq("status", "error")
    .order("updated_at", { ascending: false })
    .limit(5);

  // Storage
  const { data: buckets } = await admin.storage.listBuckets();

  return {
    tableCounts: counts,
    embeddingStats: { totalChunks, docsWithChunks: docIds.size, avgChunksPerDoc },
    recentErrors: recentErrors || [],
    storageBuckets: (buckets || []).map((b) => ({ name: b.name, public: b.public })),
    environment: {
      nodeVersion: process.version,
      nextVersion: "16.1.6",
    },
  };
}

// --- Advanced tools ---

export async function forceReprocessDocuments(schoolId: string) {
  const user = await requireAdmin(schoolId);
  const admin = createAdminClient();

  const { data: docs } = await admin
    .from("documents")
    .select("id")
    .eq("school_id", schoolId)
    .eq("status", "ready");

  if (!docs?.length) return { success: true, count: 0 };

  // Clear existing chunks
  await admin
    .from("document_chunks")
    .delete()
    .in("document_id", docs.map((d) => d.id));

  // Mark all as processing
  await admin
    .from("documents")
    .update({ status: "processing" })
    .in("id", docs.map((d) => d.id));

  // Fire off reprocessing
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  for (const doc of docs) {
    fetch(`${baseUrl}/api/process-document`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: doc.id, schoolId }),
    }).catch(() => {});
  }

  logAudit(user.id, "dev_reprocess_all", "document", undefined, { count: docs.length }, schoolId);
  revalidatePath("/", "layout");
  return { success: true, count: docs.length };
}

export async function toggleUserApproval(userId: string, schoolId: string) {
  const user = await requireAdmin(schoolId);
  const admin = createAdminClient();

  const { data: membership } = await admin
    .from("school_memberships")
    .select("approved")
    .eq("user_id", userId)
    .eq("school_id", schoolId)
    .single();

  if (!membership) return { error: "Membership not found" };

  const { error } = await admin
    .from("school_memberships")
    .update({ approved: !membership.approved })
    .eq("user_id", userId)
    .eq("school_id", schoolId);

  if (error) return { error: error.message };

  logAudit(user.id, "dev_toggle_approval", "user", userId, { approved: !membership.approved }, schoolId);
  revalidatePath("/", "layout");
  return { success: true, approved: !membership.approved };
}

export async function quickChangeRole(userId: string, schoolId: string, role: "admin" | "parent") {
  const user = await requireAdmin(schoolId);
  const admin = createAdminClient();

  const { error } = await admin
    .from("school_memberships")
    .update({ role })
    .eq("user_id", userId)
    .eq("school_id", schoolId);

  if (error) return { error: error.message };

  logAudit(user.id, "dev_change_role", "user", userId, { role }, schoolId);
  revalidatePath("/", "layout");
  return { success: true };
}

export async function getTableData(tableName: string, schoolId: string, limit: number = 50) {
  await requireAdmin(schoolId);
  const admin = createAdminClient();

  const allowed = [
    "profiles", "documents", "document_chunks", "events",
    "announcements", "categories", "folders", "chat_sessions",
    "chat_messages", "analytics_events", "audit_log", "notifications",
    "settings", "school_memberships",
  ];

  if (!allowed.includes(tableName)) return { error: "Table not allowed" };

  let query = admin.from(tableName).select("*").limit(limit);

  // Filter by school where applicable
  if (tableName !== "profiles") {
    query = query.eq("school_id", schoolId);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) return { error: error.message };
  return { data };
}

export async function exportDatabaseJSON(schoolId: string) {
  await requireAdmin(schoolId);
  const admin = createAdminClient();

  const tables = [
    "documents", "events", "announcements",
    "categories", "folders",
  ];

  const result: Record<string, unknown[]> = {};

  for (const table of tables) {
    const { data } = await admin.from(table).select("*").eq("school_id", schoolId);
    result[table] = data || [];
  }

  return result;
}
