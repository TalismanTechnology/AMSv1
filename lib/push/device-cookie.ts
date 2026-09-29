import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

/** Holds this phone's push token so signing out can unregister it. */
export const PUSH_TOKEN_COOKIE = "push_token";

/**
 * Stops pushes to this phone for whoever is signing out. The next person to
 * sign in on it registers the token again under their own account.
 */
export async function forgetThisDevice(userId: string): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(PUSH_TOKEN_COOKIE)?.value;
  if (!token) return;

  // Scoped to the signing-out user, so a tampered cookie can't remove
  // someone else's device.
  const { error } = await createAdminClient()
    .from("push_devices")
    .delete()
    .eq("token", token)
    .eq("user_id", userId);
  if (error) console.error("[push] could not forget device on sign-out", error);

  cookieStore.delete(PUSH_TOKEN_COOKIE);
}
