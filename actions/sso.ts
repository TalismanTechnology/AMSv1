"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSchoolAdmin } from "@/lib/auth/require-school-admin";
import { normalizeSenderDomain } from "@/lib/email/inbound";
import { logAudit } from "@/lib/audit";

// Records which registered Supabase SSO provider a school routes to. It does
// NOT provision the provider — that is a separate step (CLI `supabase sso add`
// or the service-role admin endpoint), so this action deliberately only stores
// a pointer and refuses configurations that would render a dead button.

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SsoSettingsInput {
  enabled: boolean;
  domain: string;
  providerId: string;
  buttonLabel: string;
}

export async function updateSsoSettings(
  schoolId: string,
  input: SsoSettingsInput
): Promise<{ error?: string; success?: boolean }> {
  const auth = await requireSchoolAdmin(schoolId);
  if ("error" in auth) return { error: auth.error };

  const rawDomain = input.domain.trim();
  const rawProviderId = input.providerId.trim();

  let domain: string | null = null;
  if (rawDomain) {
    domain = normalizeSenderDomain(rawDomain);
    if (!domain) return { error: `Invalid domain: "${rawDomain}"` };
  }

  let providerId: string | null = null;
  if (rawProviderId) {
    if (!UUID_PATTERN.test(rawProviderId)) {
      return {
        error:
          "Provider ID must be the UUID shown by `supabase sso list` (e.g. 8d0c1f4a-...).",
      };
    }
    providerId = rawProviderId.toLowerCase();
  }

  // Mirrors the schools_sso_route_required CHECK, but fails with a sentence an
  // admin can act on instead of a constraint violation.
  if (input.enabled && !domain && !providerId) {
    return {
      error:
        "Add your school's sign-in domain or provider ID before turning SSO on.",
    };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("schools")
    .update({
      sso_enabled: input.enabled,
      sso_domain: domain,
      sso_provider_id: providerId,
      sso_button_label: input.buttonLabel.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", schoolId);

  if (error) {
    // The unique index on lower(sso_domain) is the likely cause; say so rather
    // than surfacing a raw Postgres constraint name.
    if (error.code === "23505") {
      return {
        error: `Another school already routes ${domain} to its identity provider.`,
      };
    }
    return { error: error.message };
  }

  logAudit(
    auth.userId,
    "update_sso_settings",
    "school",
    schoolId,
    { enabled: input.enabled, domain, providerId },
    schoolId
  );

  revalidatePath("/", "layout");
  return { success: true };
}
