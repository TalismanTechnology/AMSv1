import type { SupabaseClient } from "@supabase/supabase-js";
import { accessTokenSession } from "./admin-google-only";

// The google_auth_sessions lookup (migration 053), kept free of server-only
// imports so middleware (edge runtime) can use it too.

export const GOOGLE_AUTH_SESSIONS_TABLE = "google_auth_sessions";

/**
 * True when the session behind `accessToken` (already accepted by getUser())
 * is a recorded Google session of `userId`. Fails closed: any error is
 * "not Google". `admin` must be a service-role client.
 */
export async function isGoogleSessionToken(
  admin: SupabaseClient,
  accessToken: string | null | undefined,
  userId: string
): Promise<boolean> {
  const claims = accessTokenSession(accessToken);
  if (!claims || claims.userId !== userId.toLowerCase()) return false;
  try {
    const { data, error } = await admin
      .from(GOOGLE_AUTH_SESSIONS_TABLE)
      .select("session_id")
      .eq("session_id", claims.sessionId)
      .eq("user_id", claims.userId)
      .maybeSingle();
    if (error) {
      console.error(`[admin-google-only] Google session lookup failed: ${error.message}`);
      return false;
    }
    return Boolean(data);
  } catch (caught: unknown) {
    console.error(
      `[admin-google-only] Google session lookup failed: ${caught instanceof Error ? caught.message : caught}`
    );
    return false;
  }
}
