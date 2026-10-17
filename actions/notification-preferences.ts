"use server";

import { createClient } from "@/lib/supabase/server";

/** Turn the signed-in user's new-document push notifications on or off. */
export async function setNewDocumentPush(
  enabled: boolean
): Promise<{ success: true } | { error: string }> {
  if (typeof enabled !== "boolean") return { error: "Invalid setting" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  // RLS limits this to the user's own row.
  const { error } = await supabase.from("notification_preferences").upsert(
    {
      user_id: user.id,
      new_document_push: enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) {
    console.error("[notification-preferences] save failed", error);
    return { error: "Couldn't save your notification setting. Please try again." };
  }
  return { success: true };
}
