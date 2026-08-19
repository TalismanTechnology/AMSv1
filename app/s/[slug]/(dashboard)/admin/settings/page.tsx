import { requireSchoolContext } from "@/lib/school-context";
import { loadSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SettingsClient } from "./client";
import { PageTransition } from "@/components/motion";
import type {
  BlackbaudConfig,
  BlackbaudCallbackResult,
  SsoConfig,
} from "./client";

/**
 * The SAML endpoints a school's IT department needs in order to register us as
 * a service provider. They're derived from the public project URL, not secret,
 * and are shown so the admin can hand them over without leaving the page.
 */
function buildSsoConfig(school: {
  sso_enabled: boolean | null;
  sso_domain: string | null;
  sso_provider_id: string | null;
  sso_button_label: string | null;
}): SsoConfig {
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

  return {
    enabled: school.sso_enabled ?? false,
    domain: school.sso_domain ?? "",
    providerId: school.sso_provider_id ?? "",
    buttonLabel: school.sso_button_label ?? "",
    acsUrl: projectUrl ? `${projectUrl}/auth/v1/sso/saml/acs` : null,
    metadataUrl: projectUrl
      ? `${projectUrl}/auth/v1/sso/saml/metadata`
      : null,
  };
}

const CALLBACK_RESULTS: readonly string[] = ["connected", "denied", "error"];

function parseCallbackResult(value?: string): BlackbaudCallbackResult {
  return value && CALLBACK_RESULTS.includes(value)
    ? (value as BlackbaudCallbackResult)
    : null;
}

/**
 * Connection status comes from the blackbaud_connection_status view, never the
 * base table — 022 dropped the base table's SELECT policy precisely so the
 * encrypted token columns cannot reach a browser. The roster count goes through
 * the admin client because blackbaud_roster has no RLS policies at all.
 */
async function loadBlackbaudConfig(
  schoolId: string,
  verificationEnabled: boolean
): Promise<BlackbaudConfig> {
  const supabase = await createClient();

  const [{ data: connection }, { count }] = await Promise.all([
    supabase
      .from("blackbaud_connection_status")
      .select("status, last_synced_at, last_error, environment_id")
      .eq("school_id", schoolId)
      .maybeSingle(),
    createAdminClient()
      .from("blackbaud_roster")
      .select("id", { count: "exact", head: true })
      .eq("school_id", schoolId)
      .eq("is_active", true),
  ]);

  return {
    verificationEnabled,
    rosterCount: count ?? 0,
    connection: connection
      ? {
          status: connection.status,
          lastSyncedAt: connection.last_synced_at,
          lastError: connection.last_error,
          environmentId: connection.environment_id,
        }
      : null,
  };
}

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ blackbaud?: string }>;
}) {
  const { slug } = await params;
  const { blackbaud } = await searchParams;
  const { school } = await requireSchoolContext(slug);

  const [settings, blackbaudConfig] = await Promise.all([
    loadSettings(school.id),
    loadBlackbaudConfig(
      school.id,
      school.blackbaud_verification_enabled ?? false
    ),
  ]);

  return (
    <PageTransition>
      <SettingsClient
        settings={settings}
        schoolId={school.id}
        schoolSlug={slug}
        joinCode={school.join_code}
        emailIngestion={{
          enabled: school.email_ingestion_enabled ?? false,
          autoSort: school.auto_sort_enabled ?? true,
          allowedDomains: school.allowed_sender_domains ?? [],
          token: school.inbound_email_token ?? null,
          inboundDomain: process.env.INBOUND_EMAIL_DOMAIN ?? null,
        }}
        blackbaud={blackbaudConfig}
        blackbaudCallback={parseCallbackResult(blackbaud)}
        sso={buildSsoConfig(school)}
      />
    </PageTransition>
  );
}
