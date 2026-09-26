import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Turns a Blackbaud-verified parent into a Supabase session.
//
// Blackbaud proves identity; Supabase stays the session layer so every
// existing RLS policy, middleware check and server action keeps working
// unchanged. Accounts are keyed on email, so a parent who registered with a
// password before Blackbaud sign-in existed lands back in the same account.

async function issueSignInLink(email: string) {
  const admin = createAdminClient();

  // Only generates the token; no email is sent.
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  if (error || !data.user || !data.properties?.hashed_token) {
    throw new Error(
      `Could not issue parent sign-in token: ${error?.message ?? "empty response"}`
    );
  }

  return { userId: data.user.id, tokenHash: data.properties.hashed_token };
}

/** Finds the account for `email`, creating it when missing. Returns its id. */
export async function findOrCreateParentAccount(
  email: string,
  fullName: string
): Promise<string> {
  const admin = createAdminClient();

  // No role metadata: the signup trigger defaults the profile to "parent".
  const { error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (createError && createError.code !== "email_exists") {
    throw new Error(`Could not create parent account: ${createError.message}`);
  }

  // createUser doesn't report the existing account's id; the link lookup does.
  return (await issueSignInLink(email)).userId;
}

/**
 * Parents must not have a working password. An account that already existed
 * may carry one — a legacy password from before Blackbaud sign-in, or one an
 * attacker set by signing up with this parent's email first. Replace it with a
 * random value nobody knows, so Blackbaud is the only way into the account.
 *
 * Call only after confirming the account is not staff, and before
 * startParentSession: changing the password invalidates any sign-in token
 * issued earlier.
 */
export async function revokeParentPassword(userId: string): Promise<void> {
  const admin = createAdminClient();

  const { error } = await admin.auth.admin.updateUserById(userId, {
    password: crypto.randomBytes(48).toString("base64url"),
  });

  if (error) {
    throw new Error(`Could not revoke parent password: ${error.message}`);
  }
}

/**
 * Issues a fresh one-time token and redeems it server-side, which writes the
 * Supabase session cookies onto the current response.
 */
export async function startParentSession(email: string): Promise<void> {
  const { tokenHash } = await issueSignInLink(email);
  const supabase = await createClient();

  const { error } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: tokenHash,
  });

  if (error) {
    throw new Error(`Could not start parent session: ${error.message}`);
  }

  // Drop every other session on this account, so anyone who got in before
  // Blackbaud verified it (see revokeParentPassword) is signed out.
  const { error: signOutError } = await supabase.auth.signOut({ scope: "others" });

  if (signOutError) {
    throw new Error(`Could not revoke other parent sessions: ${signOutError.message}`);
  }
}

export type StaffRole = "super_admin" | "school_admin";

/**
 * Staff never sign in through Blackbaud — that door is parents-only. Returns
 * the staff role if this account has one anywhere.
 */
export async function getStaffRole(userId: string): Promise<StaffRole | null> {
  const admin = createAdminClient();

  const [{ data: profile }, { data: adminMembership }] = await Promise.all([
    admin.from("profiles").select("role").eq("id", userId).maybeSingle(),
    admin
      .from("school_memberships")
      .select("id")
      .eq("user_id", userId)
      .eq("role", "admin")
      .limit(1)
      .maybeSingle(),
  ]);

  if (profile?.role === "super_admin") return "super_admin";
  if (adminMembership) return "school_admin";
  return null;
}

/**
 * Makes the parent an approved member of the school. The roster match IS the
 * approval, so an older unapproved membership is approved too.
 */
export async function ensureParentMembership(
  userId: string,
  schoolId: string
): Promise<void> {
  const admin = createAdminClient();

  const { error } = await admin
    .from("school_memberships")
    .upsert(
      { user_id: userId, school_id: schoolId, role: "parent", approved: true },
      { onConflict: "user_id,school_id" }
    );

  if (error) {
    throw new Error(`Could not add parent to school: ${error.message}`);
  }
}
