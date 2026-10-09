import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AUTHORED_BY, PERSONAL_DATA } from "./delete-account";

const migration = readFileSync(
  join(__dirname, "../../supabase/migrations/033_account_deletion_fks.sql"),
  "utf8"
);

test("every authored-by column the app un-links has a SET NULL FK in 033", () => {
  for (const [table, column] of AUTHORED_BY) {
    const row = new RegExp(`\\('${table}',\\s*'${column}',\\s*'[^']+',\\s*'SET NULL'\\)`);
    assert.match(migration, row, `${table}.${column} missing from 033`);
  }
});

test("analytics_events cascades with the profile in 033", () => {
  assert.match(migration, /\('analytics_events',\s*'user_id',\s*'public\.profiles',\s*'CASCADE'\)/);
});

test("personal data covers chats, feedback, children, push tokens and analytics", () => {
  const tables = PERSONAL_DATA.map(([table]) => table);
  for (const t of [
    "chat_sessions",
    "chat_feedback",
    "children",
    "push_devices",
    "analytics_events",
    "notifications",
    "school_memberships",
    "unanswered_questions",
  ]) {
    assert.ok(tables.includes(t), `${t} not deleted`);
  }
  // Feedback must go before the chats it points at.
  assert.ok(tables.indexOf("chat_feedback") < tables.indexOf("chat_sessions"));
});
