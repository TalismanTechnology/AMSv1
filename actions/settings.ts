"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";
import { ensureInboundAddresses, type InboundAddresses } from "@/lib/email/addresses";
import { normalizeSenderDomain } from "@/lib/email/inbound";

export async function updateSettings(
  schoolId: string,
  data: {
    school_name?: string;
    logo_url?: string | null;
    contact_info?: string | null;
    custom_system_prompt?: string | null;
    ai_temperature?: number;
    suggested_questions?: string[];
    welcome_message?: string | null;
    disable_animations?: boolean;
    require_join_code?: boolean;
    require_approval?: boolean;
    join_code?: string | null;
  }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Extract join_code since it lives on the schools table, not settings
  const { join_code, ...settingsData } = data;

  const { error } = await supabase
    .from("settings")
    .update({ ...settingsData, updated_at: new Date().toISOString() })
    .eq("school_id", schoolId);

  if (error) return { error: error.message };

  // Sync school name to the schools table so it's reflected everywhere in the UI
  if (data.school_name) {
    await supabase
      .from("schools")
      .update({ name: data.school_name, updated_at: new Date().toISOString() })
      .eq("id", schoolId);
  }

  // Update join code on the schools table
  if (join_code !== undefined) {
    const codeValue = join_code?.trim().toUpperCase() || null;

    // Check uniqueness if setting a code
    if (codeValue) {
      const { data: existing } = await supabase
        .from("schools")
        .select("id")
        .eq("join_code", codeValue)
        .neq("id", schoolId)
        .single();

      if (existing) {
        return { error: "This join code is already in use by another school" };
      }
    }

    const { error: codeError } = await supabase
      .from("schools")
      .update({ join_code: codeValue, updated_at: new Date().toISOString() })
      .eq("id", schoolId);

    if (codeError) return { error: codeError.message };
  }

  if (user) logAudit(user.id, "update_settings", "settings", undefined, data, schoolId);

  revalidatePath("/", "layout");
  return { success: true };
}

export async function updateEmailIngestion(
  schoolId: string,
  data: {
    enabled: boolean;
    autoSort: boolean;
    allowedDomains: string[];
  }
): Promise<{ error?: string; addresses?: InboundAddresses; success?: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Validate + dedupe domains.
  const normalized = new Set<string>();
  for (const raw of data.allowedDomains) {
    if (!raw.trim()) continue;
    const domain = normalizeSenderDomain(raw);
    if (!domain) return { error: `Invalid domain: "${raw}"` };
    normalized.add(domain);
  }
  const allowedDomains = [...normalized];

  // Once ingestion is on, the school has all its addresses: the whole
  // school's and one per division.
  let addresses: InboundAddresses | undefined;
  if (data.enabled) {
    try {
      addresses = await ensureInboundAddresses(supabase, schoolId);
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Could not create addresses" };
    }
  }

  const { error } = await supabase
    .from("schools")
    .update({
      email_ingestion_enabled: data.enabled,
      auto_sort_enabled: data.autoSort,
      allowed_sender_domains: allowedDomains,
      updated_at: new Date().toISOString(),
    })
    .eq("id", schoolId);

  if (error) return { error: error.message };

  logAudit(
    user.id,
    "update_email_ingestion",
    "settings",
    undefined,
    { enabled: data.enabled, autoSort: data.autoSort, domains: allowedDomains },
    schoolId
  );

  revalidatePath("/", "layout");
  return { success: true, addresses };
}
