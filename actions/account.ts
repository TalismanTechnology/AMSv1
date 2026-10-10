"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { forgetThisDevice } from "@/lib/push/device-cookie";
import { deleteAccount } from "@/lib/account/delete-account";

/** What the user must type to confirm. Checked on the server too. */
const CONFIRMATION = "DELETE";

/**
 * A signed-in user permanently deletes their own account: chats, feedback,
 * children, notifications, push devices, memberships, analytics, and the
 * sign-in account itself. Signing in with Blackbaud again later creates a
 * fresh, empty account.
 */
export async function deleteMyAccount(confirmation: string): Promise<{ error: string }> {
  if (confirmation.trim().toUpperCase() !== CONFIRMATION) {
    return { error: `Type ${CONFIRMATION} to confirm.` };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role === "super_admin") {
    return { error: "Super admin accounts can't be deleted from here." };
  }

  // Record it before the account goes (admin_id is cleared with the account,
  // the entry itself stays).
  await admin.from("audit_log").insert({
    admin_id: user.id,
    action: "delete_own_account",
    entity_type: "user",
    entity_id: user.id,
    details: {},
    school_id: null,
  });

  try {
    await forgetThisDevice(user.id);
    await deleteAccount(user.id);
  } catch (err) {
    console.error("[account] self-deletion failed:", err);
    return {
      error:
        err instanceof Error
          ? `We couldn't delete your account: ${err.message}`
          : "We couldn't delete your account.",
    };
  }

  // The auth user is gone; clear this browser's session cookies.
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Session already invalid; cookies are cleared either way.
  }

  redirect("/");
}
