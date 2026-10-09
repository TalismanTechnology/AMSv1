import { createAdminClient } from "@/lib/supabase/admin";
import { decryptToken, encryptToken } from "@/lib/blackbaud/crypto";
import { isValidSchoolRoute, normalizeSignInScopes } from "./oauth";

// A school's Veracross OAuth Application, from veracross_connections
// (migration 034). The client secret is encrypted at the app layer with the
// same AES-256-GCM helper and key (BLACKBAUD_TOKEN_ENC_KEY) that protect the
// Blackbaud refresh tokens, so a database leak alone exposes no credentials.

export interface VeracrossConnection {
  schoolId: string;
  schoolRoute: string;
  clientId: string;
  scopes: string;
  parentRoles: string[];
  dataApiEnabled: boolean;
}

interface ConnectionRow {
  school_id: string;
  school_route: string;
  client_id: string;
  client_secret_ciphertext: string;
  client_secret_iv: string;
  client_secret_tag: string;
  scopes: string;
  parent_roles: string[] | null;
  data_api_enabled: boolean;
  enabled: boolean;
}

function toConnection(row: ConnectionRow): VeracrossConnection {
  return {
    schoolId: row.school_id,
    schoolRoute: row.school_route,
    clientId: row.client_id,
    scopes: row.scopes,
    parentRoles: row.parent_roles?.length ? row.parent_roles : ["Parent"],
    dataApiEnabled: row.data_api_enabled,
  };
}

async function loadRow(schoolId: string): Promise<ConnectionRow | null> {
  const { data, error } = await createAdminClient()
    .from("veracross_connections")
    .select(
      "school_id, school_route, client_id, client_secret_ciphertext, client_secret_iv, client_secret_tag, scopes, parent_roles, data_api_enabled, enabled"
    )
    .eq("school_id", schoolId)
    .maybeSingle();

  // Before migration 034 the table doesn't exist; that is "not configured".
  if (error) {
    console.error(`Could not load Veracross connection for ${schoolId}: ${error.message}`);
    return null;
  }

  return (data as ConnectionRow | null) ?? null;
}

/** The enabled connection for a school, or null. Never includes the secret. */
export async function getVeracrossConnection(
  schoolId: string
): Promise<VeracrossConnection | null> {
  const row = await loadRow(schoolId);
  return row?.enabled ? toConnection(row) : null;
}

/** Connection plus decrypted client secret, for the server-side token calls. */
export async function getVeracrossConnectionWithSecret(
  schoolId: string
): Promise<{ connection: VeracrossConnection; clientSecret: string } | null> {
  const row = await loadRow(schoolId);
  if (!row?.enabled) return null;

  return {
    connection: toConnection(row),
    clientSecret: decryptToken({
      ciphertext: row.client_secret_ciphertext,
      iv: row.client_secret_iv,
      tag: row.client_secret_tag,
    }),
  };
}

export async function recordVeracrossError(schoolId: string, message: string): Promise<void> {
  await createAdminClient()
    .from("veracross_connections")
    .update({
      last_error: message.slice(0, 1000),
      last_error_at: new Date().toISOString(),
    })
    .eq("school_id", schoolId);
}

export interface SaveVeracrossConnectionInput {
  schoolId: string;
  schoolRoute: string;
  clientId: string;
  clientSecret: string;
  scopes?: string;
  parentRoles?: string[];
  dataApiEnabled?: boolean;
}

/** Validates, encrypts and stores a school's credentials (setup script). */
export function buildConnectionRow(input: SaveVeracrossConnectionInput) {
  const schoolRoute = input.schoolRoute.trim();
  if (!isValidSchoolRoute(schoolRoute)) {
    throw new Error(`Invalid Veracross school route: ${JSON.stringify(input.schoolRoute)}`);
  }

  const clientId = input.clientId.trim();
  const clientSecret = input.clientSecret.trim();
  if (!clientId || !clientSecret) {
    throw new Error("Veracross client id and client secret are both required");
  }

  const parentRoles = (input.parentRoles ?? ["Parent"])
    .map((role) => role.trim())
    .filter(Boolean);
  if (parentRoles.length === 0) {
    throw new Error("At least one Veracross parent role is required");
  }

  const secret = encryptToken(clientSecret);

  return {
    school_id: input.schoolId,
    school_route: schoolRoute,
    client_id: clientId,
    client_secret_ciphertext: secret.ciphertext,
    client_secret_iv: secret.iv,
    client_secret_tag: secret.tag,
    scopes: normalizeSignInScopes(input.scopes ?? "sso"),
    parent_roles: parentRoles,
    data_api_enabled: input.dataApiEnabled ?? false,
    enabled: true,
    last_error: null,
    last_error_at: null,
    updated_at: new Date().toISOString(),
  };
}
