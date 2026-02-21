"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";

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
