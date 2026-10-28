"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSchoolAdmin } from "@/lib/auth/require-school-admin";
import { logAudit } from "@/lib/audit";
import { reportAiFailure } from "@/lib/alerts/ai-failure-alert";
import { adminAiErrorMessage, isAiProviderError } from "@/lib/ai/provider-errors";
import { CONTACTS_TABLE_MISSING_MESSAGE, isMissingTableError } from "@/lib/contacts/directory";
import {
  CONTACT_FOLDERS_MISSING_MESSAGE,
  cleanContactFolderName,
  folderKey,
  isContactFoldersMissingError,
  isMissingFolderColumnError,
} from "@/lib/contacts/folders";
import {
  AI_SORT_MAX_CONTACTS,
  proposeContactFolders,
  sanitizeContactSortProposal,
  type AiSortContact,
  type AiSortFolder,
  type AiSortPlan,
} from "@/lib/contacts/ai-sort";

// Server actions for contact folders (migration 049) and the AI sort on the
// admin Contacts page. Like actions/contacts.ts, every entry point
// re-authorizes against the school id it was handed and every query is
// scoped to that school, so ids from another school do nothing. All of it
// runs on the admin's own client (RLS: admins manage their school's rows).
// Nothing here changes a contact's status: folders are only organisation.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** More than any directory will hold; keeps the id filter a sane size. */
const MAX_MOVE = 500;

type DbError = { code?: string; message: string };

function friendlyDbError(error: DbError): string {
  if (isMissingFolderColumnError(error)) return CONTACT_FOLDERS_MISSING_MESSAGE;
  if (isMissingTableError(error) && /school_contacts/.test(error.message)) {
    return CONTACTS_TABLE_MISSING_MESSAGE;
  }
  if (isContactFoldersMissingError(error)) return CONTACT_FOLDERS_MISSING_MESSAGE;
  if (error.code === "23505") return "There's already a folder with that name.";
  return error.message;
}

function revalidate() {
  revalidatePath("/", "layout");
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function loadFolders(
  supabase: Supabase,
  schoolId: string
): Promise<{ folders: (AiSortFolder & { sort_order: number })[]; error?: DbError }> {
  const { data, error } = await supabase
    .from("contact_folders")
    .select("id, name, sort_order")
    .eq("school_id", schoolId)
    .order("sort_order", { ascending: true });
  if (error) return { folders: [], error };
  return { folders: data ?? [] };
}

async function folderOfSchool(
  supabase: Supabase,
  schoolId: string,
  folderId: string
): Promise<{ id: string } | { error: string }> {
  if (!UUID_RE.test(folderId)) return { error: "Folder not found." };
  const { data, error } = await supabase
    .from("contact_folders")
    .select("id")
    .eq("id", folderId)
    .eq("school_id", schoolId)
    .maybeSingle();
  if (error) return { error: friendlyDbError(error) };
  if (!data) return { error: "Folder not found." };
  return { id: data.id };
}

export async function createContactFolder(
  schoolId: string,
  name: string
): Promise<{ error?: string; id?: string }> {
  const auth = await requireSchoolAdmin(schoolId);
  if ("error" in auth) return { error: auth.error };
  const clean = cleanContactFolderName(name);
  if (!clean) return { error: "Enter a folder name." };

  const supabase = await createClient();
  const existing = await loadFolders(supabase, schoolId);
  if (existing.error) return { error: friendlyDbError(existing.error) };
  if (existing.folders.some((f) => folderKey(f.name) === folderKey(clean))) {
    return { error: "There's already a folder with that name." };
  }
  const sortOrder = Math.max(-1, ...existing.folders.map((f) => f.sort_order ?? 0)) + 1;

  const { data, error } = await supabase
    .from("contact_folders")
    .insert({ school_id: schoolId, name: clean, sort_order: sortOrder })
    .select("id")
    .single();
  if (error) return { error: friendlyDbError(error) };

  logAudit(auth.userId, "contact_folder.create", "contact_folder", data.id, { name: clean }, schoolId);
  revalidate();
  return { id: data.id };
}

export async function renameContactFolder(
  schoolId: string,
  folderId: string,
  name: string
): Promise<{ error?: string }> {
  const auth = await requireSchoolAdmin(schoolId);
  if ("error" in auth) return { error: auth.error };
  const clean = cleanContactFolderName(name);
  if (!clean) return { error: "Enter a folder name." };
  if (!UUID_RE.test(folderId)) return { error: "Folder not found." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contact_folders")
    .update({ name: clean, updated_at: new Date().toISOString() })
    .eq("id", folderId)
    .eq("school_id", schoolId)
    .select("id");
  if (error) return { error: friendlyDbError(error) };
  if (!data?.length) return { error: "Folder not found." };

  logAudit(auth.userId, "contact_folder.rename", "contact_folder", folderId, { name: clean }, schoolId);
  revalidate();
  return {};
}

/** Deletes the folder only; its contacts become unfiled (ON DELETE SET NULL). */
export async function deleteContactFolder(
  schoolId: string,
  folderId: string
): Promise<{ error?: string }> {
  const auth = await requireSchoolAdmin(schoolId);
  if ("error" in auth) return { error: auth.error };
  if (!UUID_RE.test(folderId)) return { error: "Folder not found." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("contact_folders")
    .delete()
    .eq("id", folderId)
    .eq("school_id", schoolId);
  if (error) return { error: friendlyDbError(error) };

  logAudit(auth.userId, "contact_folder.delete", "contact_folder", folderId, undefined, schoolId);
  revalidate();
  return {};
}

/** Move contacts into a folder of this school, or out of any (null). */
export async function moveContactsToFolder(
  schoolId: string,
  contactIds: string[],
  folderId: string | null
): Promise<{ error?: string; moved?: number }> {
  const auth = await requireSchoolAdmin(schoolId);
  if ("error" in auth) return { error: auth.error };
  if (!Array.isArray(contactIds)) return { error: "Invalid request." };
  const ids = [...new Set(contactIds.filter((id) => typeof id === "string" && UUID_RE.test(id)))];
  if (!ids.length) return { moved: 0 };
  if (ids.length > MAX_MOVE) return { error: `Move at most ${MAX_MOVE} contacts at once.` };

  const supabase = await createClient();
  if (folderId !== null) {
    const folder = await folderOfSchool(supabase, schoolId, String(folderId));
    if ("error" in folder) return folder;
  }

  const { data, error } = await supabase
    .from("school_contacts")
    .update({ folder_id: folderId, updated_at: new Date().toISOString() })
    .eq("school_id", schoolId)
    .in("id", ids)
    .select("id");
  if (error) return { error: friendlyDbError(error) };

  logAudit(auth.userId, "contact.move", "school_contact", ids.length === 1 ? ids[0] : undefined, { folderId, moved: data?.length ?? 0 }, schoolId);
  revalidate();
  return { moved: data?.length ?? 0 };
}

// ── AI sort ────────────────────────────────────────────────────────

export interface ContactAiSortPreview extends AiSortPlan {
  /** Contacts not looked at this run (directory larger than one run). */
  remaining: number;
}

/** This school's approved and suggested contacts, as AI sort sees them. */
async function aiSortInputs(
  supabase: Supabase,
  schoolId: string
): Promise<{ contacts: AiSortContact[]; folders: AiSortFolder[] } | { error: string }> {
  const [contactsResult, foldersResult, divisionsResult] = await Promise.all([
    supabase
      .from("school_contacts")
      .select("id, name, role, topics, division_id, folder_id")
      .eq("school_id", schoolId)
      .in("status", ["approved", "suggested"])
      .order("created_at", { ascending: true }),
    loadFolders(supabase, schoolId),
    supabase
      .from("event_calendars")
      .select("id, name")
      .eq("school_id", schoolId)
      .eq("kind", "division"),
  ]);
  if (foldersResult.error) return { error: friendlyDbError(foldersResult.error) };
  if (contactsResult.error) return { error: friendlyDbError(contactsResult.error) };
  const divisions = new Map((divisionsResult.data ?? []).map((d) => [d.id, d.name as string]));
  return {
    folders: foldersResult.folders.map((f) => ({ id: f.id, name: f.name })),
    contacts: (contactsResult.data ?? []).map((c) => ({
      id: c.id,
      name: c.name ?? "",
      role: c.role ?? "",
      topics: c.topics ?? [],
      division: c.division_id ? divisions.get(c.division_id) ?? null : null,
      folder_id: c.folder_id ?? null,
    })),
  };
}

/**
 * AI sort, step 1: ask the model for folders and where each contact goes,
 * and return the checked plan as a preview. Changes nothing.
 */
export async function proposeContactAiSort(
  schoolId: string
): Promise<{ preview?: ContactAiSortPreview; error?: string }> {
  const auth = await requireSchoolAdmin(schoolId);
  if ("error" in auth) return { error: auth.error };

  const supabase = await createClient();
  const inputs = await aiSortInputs(supabase, schoolId);
  if ("error" in inputs) return { error: inputs.error };

  const batch = inputs.contacts.slice(0, AI_SORT_MAX_CONTACTS);
  if (!batch.length) {
    return { preview: { folders: [], moves: [], skipped: [], remaining: 0 } };
  }

  let proposal;
  try {
    proposal = await proposeContactFolders({ contacts: batch, existingFolders: inputs.folders });
  } catch (err) {
    // Logged, and the owner alerted when it's the provider's fault; the
    // provider's own text never reaches the page.
    const { category } = reportAiFailure(err, { source: "contacts.ai-sort", schoolId });
    return {
      error: isAiProviderError(err)
        ? adminAiErrorMessage(category)
        : "The AI didn't return a usable answer. Try again.",
    };
  }

  const plan = sanitizeContactSortProposal({
    contacts: batch,
    folders: inputs.folders,
    proposal,
  });
  if (plan.skipped.length) {
    console.warn(`[contacts-ai-sort] Dropped ${plan.skipped.length} proposed assignment(s)`, plan.skipped.slice(0, 20));
  }
  return { preview: { ...plan, remaining: inputs.contacts.length - batch.length } };
}

/**
 * AI sort, step 2: apply the moves the admin kept in the preview. The plan is
 * re-checked against the database (contacts deleted, folders made or renamed
 * since are handled); missing folders are created, existing ones reused.
 */
export async function applyContactAiSort(
  schoolId: string,
  moves: { contactId: string; folder: string }[]
): Promise<{ created?: string[]; moved?: number; skipped?: number; error?: string }> {
  const auth = await requireSchoolAdmin(schoolId);
  if ("error" in auth) return { error: auth.error };
  if (!Array.isArray(moves)) return { error: "Invalid request." };
  if (moves.length > MAX_MOVE) return { error: `Move at most ${MAX_MOVE} contacts at once.` };

  const supabase = await createClient();
  const inputs = await aiSortInputs(supabase, schoolId);
  if ("error" in inputs) return { error: inputs.error };

  const plan = sanitizeContactSortProposal({
    contacts: inputs.contacts,
    folders: inputs.folders,
    proposal: {
      assignments: moves.map((m) => ({
        contactId: String(m?.contactId ?? ""),
        folder: String(m?.folder ?? ""),
      })),
    },
  });

  const folderIds = new Map<string, string>();
  const created: string[] = [];
  let nextOrder =
    Math.max(-1, ...(await loadFolders(supabase, schoolId)).folders.map((f) => f.sort_order ?? 0)) + 1;
  for (const target of plan.folders) {
    if (target.existingId) {
      folderIds.set(target.name, target.existingId);
      continue;
    }
    const { data, error } = await supabase
      .from("contact_folders")
      .insert({ school_id: schoolId, name: target.name, sort_order: nextOrder++ })
      .select("id")
      .single();
    if (data) {
      folderIds.set(target.name, data.id);
      created.push(target.name);
      continue;
    }
    // Made by someone else since the plan was checked: use theirs.
    if (error?.code === "23505") {
      const again = await loadFolders(supabase, schoolId);
      const match = again.folders.find((f) => folderKey(f.name) === folderKey(target.name));
      if (match) {
        folderIds.set(target.name, match.id);
        continue;
      }
    }
    return { error: friendlyDbError(error ?? { message: "Couldn't create a folder." }) };
  }

  let moved = 0;
  for (const [name, folderId] of folderIds) {
    const ids = plan.moves.filter((m) => m.folder === name).map((m) => m.contactId);
    if (!ids.length) continue;
    const { data, error } = await supabase
      .from("school_contacts")
      .update({ folder_id: folderId, updated_at: new Date().toISOString() })
      .eq("school_id", schoolId)
      .in("id", ids)
      .select("id");
    if (error) return { error: friendlyDbError(error) };
    moved += data?.length ?? 0;
  }

  logAudit(auth.userId, "contact.ai_sort", "school_contact", undefined, { moved, created }, schoolId);
  revalidate();
  return { created, moved, skipped: moves.length - plan.moves.length };
}
