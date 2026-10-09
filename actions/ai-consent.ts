"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { consentGrantedFields, consentRevokedFields } from "@/lib/ai/consent";

// Records or withdraws the signed-in user's consent to AI processing
// (profiles.ai_consent_at / ai_consent_version, migration 035). The session
// decides whose row is written; the client never sends a user id.

async function writeConsent(fields: ReturnType<typeof consentGrantedFields>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await createAdminClient()
    .from("profiles")
    .update(fields)
    .eq("id", user.id);
  if (error) {
    console.error("Failed to update AI consent:", error);
    return { error: "Couldn't save your choice. Please try again." };
  }

  revalidatePath("/", "layout");
  return { success: true as const };
}

/** The user agreed to the current AI-processing notice. */
export async function grantAiConsent() {
  return writeConsent(consentGrantedFields());
}

/** The user withdrew consent; chat asks again before the next question. */
export async function revokeAiConsent() {
  return writeConsent(consentRevokedFields());
}
