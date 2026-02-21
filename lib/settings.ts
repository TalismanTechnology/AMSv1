import { createClient } from "@/lib/supabase/server";
import type { Settings } from "@/lib/types";

function getDefaultSettings(schoolId: string): Settings {
  return {
    school_id: schoolId,
    school_name: "AskMySchool",
    logo_url: null,
    contact_info: null,
    custom_system_prompt: null,
    ai_temperature: 0.7,
    suggested_questions: [],
    welcome_message: null,
    disable_animations: false,
    require_join_code: false,
    require_approval: true,
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
  } as Settings;
}
