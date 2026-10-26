"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSchoolAdmin } from "@/lib/auth/require-school-admin";
import { logAudit } from "@/lib/audit";
import {
  CONTACTS_TABLE_MISSING_MESSAGE,
  cleanTopics,
  isMissingTableError,
  mailtoHref,
  normalizePhone,
} from "@/lib/contacts/directory";
import { suggestContactsFromDocuments } from "@/lib/contacts/suggest";
import { approveSuggestedContacts } from "@/lib/contacts/approve";

// Server actions behind the "Contacts" tab in admin settings. Every entry
// point re-authorizes against the specific school id it was handed, and every
// query is scoped to that school, so a contact id from another school does
// nothing.

export interface ContactInput {
  name: string;
  role: string;
  email: string;
  phone: string;
  divisionId: string | null;
  topics: string[];
}

function friendlyDbError(error: { code?: string; message: string }): string {
  if (isMissingTableError(error)) return CONTACTS_TABLE_MISSING_MESSAGE;
  return error.message;
}

async function validate(
  schoolId: string,
  input: ContactInput
): Promise<{ error: string } | { row: Record<string, unknown> }> {
  const name = input.name.trim().slice(0, 120);
  const role = input.role.trim().slice(0, 120);
  const email = input.email.trim();
  const phone = input.phone.trim().slice(0, 40);
  if (!name && !role) return { error: "Enter a name or a role." };
  if (!email && !phone) return { error: "Enter an email address or a phone number." };
  if (email && !mailtoHref(email)) return { error: "That email address doesn't look right." };
  if (phone && normalizePhone(phone).length < 7) {
    return { error: "That phone number doesn't look right." };
  }

  let divisionId: string | null = null;
  if (input.divisionId) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("event_calendars")
      .select("id")
      .eq("id", input.divisionId)
      .eq("school_id", schoolId)
      .eq("kind", "division")
      .maybeSingle();
    if (!data) return { error: "That division wasn't found." };
    divisionId = data.id;
  }

  return {
    row: {
      name,
      role,
      email: email || null,
      phone: phone || null,
      division_id: divisionId,
      topics: cleanTopics(input.topics),
    },
  };
}

function revalidate() {
  revalidatePath("/", "layout");
}

export async function createContact(
  schoolId: string,
  input: ContactInput
): Promise<{ error?: string; id?: string }> {
  const auth = await requireSchoolAdmin(schoolId);
  if ("error" in auth) return { error: auth.error };

  const checked = await validate(schoolId, input);
  if ("error" in checked) return checked;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("school_contacts")
    .insert({ ...checked.row, school_id: schoolId, status: "approved", source: "admin" })
    .select("id")
    .single();
  if (error) return { error: friendlyDbError(error) };

  logAudit(auth.userId, "contact.create", "school_contact", data.id, undefined, schoolId);
  revalidate();
  return { id: data.id };
}

/**
 * Save edits to a contact. `approve` also approves it — the "Save & approve"
 * of a suggestion an admin corrected first.
 */
export async function updateContact(
  schoolId: string,
  contactId: string,
  input: ContactInput,
  { approve = false }: { approve?: boolean } = {}
): Promise<{ error?: string }> {
  const auth = await requireSchoolAdmin(schoolId);
  if ("error" in auth) return { error: auth.error };

  const checked = await validate(schoolId, input);
  if ("error" in checked) return checked;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("school_contacts")
    .update({
      ...checked.row,
      ...(approve ? { status: "approved" } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", contactId)
    .eq("school_id", schoolId)
    .select("id");
  if (error) return { error: friendlyDbError(error) };
  if (!data?.length) return { error: "Contact not found." };

  logAudit(auth.userId, approve ? "contact.approve" : "contact.update", "school_contact", contactId, undefined, schoolId);
  revalidate();
  return {};
}

export async function setContactStatus(
  schoolId: string,
  contactId: string,
  status: "approved" | "rejected"
): Promise<{ error?: string }> {
  const auth = await requireSchoolAdmin(schoolId);
  if ("error" in auth) return { error: auth.error };
  if (status !== "approved" && status !== "rejected") return { error: "Invalid status." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("school_contacts")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", contactId)
    .eq("school_id", schoolId)
    .select("id");
  if (error) return { error: friendlyDbError(error) };
  if (!data?.length) return { error: "Contact not found." };

  logAudit(auth.userId, status === "approved" ? "contact.approve" : "contact.reject", "school_contact", contactId, undefined, schoolId);
  revalidate();
  return {};
}

/**
 * "Approve all": approve the suggested contacts the admin confirmed, in one
 * update. Authorized for this school first; the update only touches this
 * school's rows that are still suggested (lib/contacts/approve.ts).
 */
export async function approveAllSuggestedContacts(
  schoolId: string,
  contactIds: string[]
): Promise<{ error?: string; approved?: number }> {
  const auth = await requireSchoolAdmin(schoolId);
  if ("error" in auth) return { error: auth.error };
  if (!Array.isArray(contactIds)) return { error: "Invalid request." };

  const supabase = await createClient();
  const result = await approveSuggestedContacts(supabase, schoolId, contactIds);
  if (result.error) return { error: friendlyDbError(result.error) };

  logAudit(auth.userId, "contact.approve_all", "school_contact", undefined, { approved: result.approved }, schoolId);
  revalidate();
  return { approved: result.approved };
}

export async function deleteContact(
  schoolId: string,
  contactId: string
): Promise<{ error?: string }> {
  const auth = await requireSchoolAdmin(schoolId);
  if ("error" in auth) return { error: auth.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("school_contacts")
    .delete()
    .eq("id", contactId)
    .eq("school_id", schoolId);
  if (error) return { error: friendlyDbError(error) };

  logAudit(auth.userId, "contact.delete", "school_contact", contactId, undefined, schoolId);
  revalidate();
  return {};
}

/**
 * Scan the school's ready documents for staff contacts and add the new ones
 * as suggestions. Runs with the service role (document text lives in
 * storage), so it is only reached after requireSchoolAdmin, and every query
 * inside is scoped to this school.
 */
export async function suggestContactsFromDocs(
  schoolId: string
): Promise<{ error?: string; inserted?: number; documentsScanned?: number }> {
  const auth = await requireSchoolAdmin(schoolId);
  if ("error" in auth) return { error: auth.error };

  const result = await suggestContactsFromDocuments(createAdminClient(), schoolId, {
    write: true,
  });
  if (result.error) return { error: result.error };

  logAudit(auth.userId, "contact.suggest", "school_contact", undefined, { documentsScanned: result.documentsScanned, inserted: result.inserted }, schoolId);
  revalidate();
  return { inserted: result.inserted, documentsScanned: result.documentsScanned };
}
