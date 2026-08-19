import { createAdminClient } from "@/lib/supabase/admin";
import { decryptToken, encryptToken } from "./crypto";

// Blackbaud OAuth 2.0 authorization-code flow.
//
// Our developer app has ONE client_id/secret globally. Each school runs a
// one-time consent that grants us a refresh token scoped to *their* Blackbaud
// environment. So the per-school secret is the refresh token, not the app creds.

export const OAUTH_AUTHORIZE_URL = "https://oauth2.sky.blackbaud.com/authorization";
export const OAUTH_TOKEN_URL = "https://oauth2.sky.blackbaud.com/token";

// Refresh a little early so a token doesn't expire mid-request.
const EXPIRY_SKEW_MS = 5 * 60 * 1000;

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  environment_id?: string;
  legal_entity_id?: string;
}

function getAppCredentials() {
  const clientId = process.env.BLACKBAUD_CLIENT_ID;
  const clientSecret = process.env.BLACKBAUD_CLIENT_SECRET;
  const redirectUri = process.env.BLACKBAUD_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Blackbaud OAuth not configured (BLACKBAUD_CLIENT_ID / BLACKBAUD_CLIENT_SECRET / BLACKBAUD_REDIRECT_URI)"
    );
  }

  return { clientId, clientSecret, redirectUri };
}

function basicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

async function postToken(body: URLSearchParams): Promise<TokenResponse> {
  const { clientId, clientSecret } = getAppCredentials();

  const response = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(clientId, clientSecret),
    },
    body,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Blackbaud token request failed (${response.status}): ${detail}`);
  }

  return (await response.json()) as TokenResponse;
}

// Build the consent URL a school admin is sent to. `state` must be a signed
// value carrying the school id — an unsigned state would let an admin bind
// their authorization to a different school's row.
export function buildAuthorizeUrl(state: string): string {
  const { clientId, redirectUri } = getAppCredentials();

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    state,
  });

  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`;
}

// Called from the OAuth callback. Persists the encrypted refresh token so the
// school is connected from here on.
export async function exchangeCodeForConnection(
  schoolId: string,
  code: string
): Promise<void> {
  const { redirectUri } = getAppCredentials();

  const tokens = await postToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    })
  );

  await persistTokens(schoolId, tokens);
}

async function persistTokens(
  schoolId: string,
  tokens: TokenResponse
): Promise<void> {
  const refresh = encryptToken(tokens.refresh_token);
  const access = encryptToken(tokens.access_token);

  const supabase = createAdminClient();
  const { error } = await supabase.from("blackbaud_connections").upsert(
    {
      school_id: schoolId,
      environment_id: tokens.environment_id ?? null,
      legal_entity_id: tokens.legal_entity_id ?? null,
      refresh_token_ciphertext: refresh.ciphertext,
      refresh_token_iv: refresh.iv,
      refresh_token_tag: refresh.tag,
      access_token_ciphertext: access.ciphertext,
      access_token_iv: access.iv,
      access_token_tag: access.tag,
      access_token_expires_at: new Date(
        Date.now() + tokens.expires_in * 1000
      ).toISOString(),
      status: "connected",
      last_error: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "school_id" }
  );

  if (error) {
    throw new Error(`Failed to persist Blackbaud connection: ${error.message}`);
  }
}

async function markConnectionFailed(
  schoolId: string,
  status: "expired" | "error",
  message: string
): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from("blackbaud_connections")
    .update({
      status,
      last_error: message,
      updated_at: new Date().toISOString(),
    })
    .eq("school_id", schoolId);
}

// Returns a usable access token for a school, refreshing if the cached one is
// missing or near expiry. Callers should not cache the result themselves —
// this function is the single source of truth for token freshness.
//
// `forceRefresh` skips the cache: use it after Blackbaud rejects a token we
// still believe is valid (revoked out-of-band), where reusing the cache would
// just resend the same rejected token.
export async function getAccessToken(
  schoolId: string,
  forceRefresh = false
): Promise<string> {
  const supabase = createAdminClient();

  const { data: connection, error } = await supabase
    .from("blackbaud_connections")
    .select("*")
    .eq("school_id", schoolId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load Blackbaud connection: ${error.message}`);
  }

  if (!connection) {
    throw new Error(`School ${schoolId} has no Blackbaud connection`);
  }

  const expiresAt = connection.access_token_expires_at
    ? new Date(connection.access_token_expires_at).getTime()
    : 0;

  if (
    !forceRefresh &&
    connection.access_token_ciphertext &&
    expiresAt - EXPIRY_SKEW_MS > Date.now()
  ) {
    return decryptToken({
      ciphertext: connection.access_token_ciphertext,
      iv: connection.access_token_iv,
      tag: connection.access_token_tag,
    });
  }

  const refreshToken = decryptToken({
    ciphertext: connection.refresh_token_ciphertext,
    iv: connection.refresh_token_iv,
    tag: connection.refresh_token_tag,
  });

  let tokens: TokenResponse;

  try {
    tokens = await postToken(
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      })
    );
  } catch (caught: unknown) {
    const message = caught instanceof Error ? caught.message : "Unknown refresh failure";
    // A rejected refresh token means the school revoked access or it aged out;
    // surface it as `expired` so the admin UI can prompt a reconnect.
    const status = message.includes("(400)") || message.includes("(401)") ? "expired" : "error";
    await markConnectionFailed(schoolId, status, message);
    throw new Error(`Blackbaud token refresh failed for school ${schoolId}: ${message}`);
  }

  // Blackbaud rotates the refresh token on every use, so the token we just
  // received is the ONLY one it will still honour — the one in the database is
  // already dead. Losing this write means losing the connection entirely, so
  // retry before giving up, and if it still fails, say so loudly: the row now
  // holds a stale token and no amount of retrying the sync will fix it.
  try {
    await persistTokens(schoolId, tokens);
  } catch (caught: unknown) {
    const message = caught instanceof Error ? caught.message : "Unknown persist failure";

    try {
      await persistTokens(schoolId, tokens);
    } catch {
      await markConnectionFailed(
        schoolId,
        "error",
        `Rotated Blackbaud token could not be saved (${message}). The stored refresh token is stale — this school must reconnect.`
      );
      throw new Error(
        `Blackbaud token rotation lost for school ${schoolId}: ${message}`
      );
    }
  }

  return tokens.access_token;
}
