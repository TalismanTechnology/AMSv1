import { createClient } from "@/lib/supabase/server";
import { DEFAULT_ROLLOVER } from "@/lib/grades";
import type { Settings } from "@/lib/types";

function getDefaultSettings(schoolId: string): Settings {
  return {
    school_id: schoolId,
    school_name: "AskMySchool",
    logo_url: null,
    contact_info: null,
    custom_system_prompt: null,
    ai_temperature: 0.2,
    suggested_questions: [],
    welcome_message: null,
    disable_animations: false,
    require_join_code: false,
    require_approval: true,
    new_document_push_enabled: true,
    grade_rollover_month: DEFAULT_ROLLOVER.month,
    grade_rollover_day: DEFAULT_ROLLOVER.day,
    updated_at: new Date().toISOString(),
  };
}

export async function loadSettings(schoolId: string): Promise<Settings> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("settings")
    .select("*")
    .eq("school_id", schoolId)
    .single();

  if (!data) return getDefaultSettings(schoolId);
  return {
    ...data,
    suggested_questions: Array.isArray(data.suggested_questions)
      ? data.suggested_questions
      : [],
    // Missing until migration 042 is applied.
    new_document_push_enabled: data.new_document_push_enabled ?? true,
    // Missing until migration 043 is applied.
    grade_rollover_month: data.grade_rollover_month ?? DEFAULT_ROLLOVER.month,
    grade_rollover_day: data.grade_rollover_day ?? DEFAULT_ROLLOVER.day,
  } as Settings;
}
