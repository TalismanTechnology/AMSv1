import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Permanently delete a user's account: their personal data, then the
 * Supabase auth user (which cascades to `profiles`).
 *
 * Runs with the service role. Callers must authorize first: the user deleting
 * themselves, or a school admin removing a member (actions/users.ts).
 *
 * Rows are deleted / un-linked explicitly rather than relying only on the
 * foreign keys, so this works before migration 033 is applied (until then
 * analytics_events and the "created by" columns block deleting a profile).
 * Once 033 is applied the FKs do the same thing as a backstop.
 */

/** Rows that are the user's own data, deleted outright: [table, column]. */
export const PERSONAL_DATA: ReadonlyArray<readonly [string, string]> = [
  // Feedback and unanswered questions before chats: both quote the user.
  ["chat_feedback", "user_id"],
  ["unanswered_questions", "user_id"],
  // Analytics events store the question text.
  ["analytics_events", "user_id"],
  // Messages cascade from their session.
  ["chat_sessions", "user_id"],
  ["children", "parent_id"],
  ["notifications", "user_id"],
  ["announcement_dismissals", "user_id"],
  ["push_devices", "user_id"],
  ["school_memberships", "user_id"],
];

/**
 * Columns recording who created or reviewed shared school content. The
 * content stays (it belongs to the school); the link to the person is
 * cleared. Must match the SET NULL foreign keys in migration 033.
 */
export const AUTHORED_BY: ReadonlyArray<readonly [string, string]> = [
  ["documents", "uploaded_by"],
  ["events", "created_by"],
  ["announcements", "created_by"],
  ["audit_log", "admin_id"],
  ["blackbaud_calendar_feeds", "created_by"],
  ["blackbaud_events", "reviewed_by"],
  ["document_audits", "created_by"],
];

/** PostgREST / Postgres codes for a table or column that doesn't exist. */
const MISSING_RELATION = new Set(["PGRST205", "PGRST204", "42P01", "42703"]);

export async function deleteAccount(userId: string): Promise<void> {
  const admin = createAdminClient();

  const { data: authUser, error: getError } = await admin.auth.admin.getUserById(userId);
  if (getError || !authUser?.user) {
    throw new Error(`Account not found: ${getError?.message ?? userId}`);
  }
  const email = authUser.user.email?.trim().toLowerCase() ?? null;

  for (const [table, column] of PERSONAL_DATA) {
    const { error } = await admin.from(table).delete().eq(column, userId);
    if (error && !MISSING_RELATION.has(error.code)) {
      throw new Error(`Could not delete ${table}: ${error.message}`);
    }
  }

  for (const [table, column] of AUTHORED_BY) {
    const { error } = await admin
      .from(table)
      .update({ [column]: null })
      .eq(column, userId);
    if (error && !MISSING_RELATION.has(error.code)) {
      throw new Error(`Could not unlink ${table}.${column}: ${error.message}`);
    }
  }

  // Pending app sign-in codes are keyed by email, not user id.
  if (email) {
    await admin.from("app_sign_in_handoffs").delete().eq("email", email);
  }

  // Deleting the auth user cascades to profiles (001: profiles.id references
  // auth.users on delete cascade) and to anything still keyed on it.
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    throw new Error(`Could not delete the sign-in account: ${deleteError.message}`);
  }

  // Belt and braces: the cascade should already have removed it.
  await admin.from("profiles").delete().eq("id", userId);
}
