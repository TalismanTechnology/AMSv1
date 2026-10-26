"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  TERMS_ASSENT_REQUIRED_MESSAGE,
  consentGrantedFields,
  consentRevokedFields,
} from "@/lib/ai/consent";

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

/**
 * The user agreed to the current AI-processing notice. The notice includes the
 * "I agree to the Terms of Service and Privacy Policy" checkbox, so consent is
 * only recorded when it was ticked; the stored version then records that
 * assent too (lib/ai/consent.ts).
 */
export async function grantAiConsent({ acceptedTerms }: { acceptedTerms: boolean }) {
  if (acceptedTerms !== true) return { error: TERMS_ASSENT_REQUIRED_MESSAGE };
  return writeConsent(consentGrantedFields());
}

/** The user withdrew consent; chat asks again before the next question. */
export async function revokeAiConsent() {
  return writeConsent(consentRevokedFields());
}
