import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

// Source-level checks that the owner lock is wired into every guard that lets
// a super-admin into a school, and kept out of every service path.

const root = path.resolve(__dirname, "../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

test("the shared school guards consult the owner lock", () => {
  assert.match(read("lib/school-context.ts"), /superAdminLockedOut\(user\.id, school\.id\)/);
  assert.match(read("lib/school-context.ts"), /redirect\(`\/s\/\$\{slug\}\/unlock`\)/);
  assert.match(read("lib/auth/require-school-admin.ts"), /schoolAccessFor\(/);
  assert.match(read("lib/auth/require-school-admin.ts"), /SCHOOL_LOCKED_ERROR/);
});

// Server actions that authorize through RLS or their own checks rather than
// requireSchoolAdmin, each with the functions that must call the lock helper.
const GUARDED_ACTIONS: Record<string, string[]> = {
  "actions/categories.ts": ["createCategory", "updateCategory", "deleteCategory"],
  "actions/folders.ts": ["createFolder", "renameFolder", "deleteFolder", "moveDocumentToFolder"],
  "actions/documents.ts": [
    "uploadDocument",
    "createDocumentRecord",
    "deleteDocument",
    "bulkDeleteDocuments",
    "approveDocument",
    "updateDocument",
    "searchDocumentsByName",
    "searchDocumentContent",
  ],
  "actions/document-audit.ts": ["runDocumentAudit", "getLatestAudit"],
  "actions/event-calendars.ts": ["createEventCalendar", "updateEventCalendar", "deleteEventCalendar"],
  "actions/event-import.ts": ["extractEventsFromDocument", "createEventsBulk"],
  "actions/events.ts": ["createEvent", "updateEvent", "deleteEvent"],
  "actions/settings.ts": ["updateSettings", "updateEmailIngestion"],
  "actions/unanswered-questions.ts": [
    "getUnansweredQuestions",
    "dismissUnansweredQuestion",
    "dismissUnansweredCluster",
    "answerUnansweredCluster",
  ],
  "actions/users.ts": ["approveUser", "approveAllPending", "changeUserRole"],
  "actions/notifications.ts": ["getNotifications", "getUnreadCount", "markNotificationRead", "markAllRead"],
  "actions/parent-documents.ts": ["getParentDocuments", "getParentCategories"],
};

/** The body of `export async function name(` up to the next top-level export. */
function functionBody(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}(`);
  assert.notEqual(start, -1, `${name} not found`);
  const next = source.indexOf("\nexport ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

for (const [file, functions] of Object.entries(GUARDED_ACTIONS)) {
  test(`${file}: every school action checks the owner lock`, () => {
    const source = read(file);
    for (const name of functions) {
      assert.match(
        functionBody(source, name),
        /schoolLockError\(|assertSchoolNotLocked\(/,
        `${name} must call the owner lock helper`
      );
    }
  });
}

test("action-local super-admin bypasses check the owner lock", () => {
  // Each of these has its own "super_admin → allowed" shortcut.
  for (const file of ["actions/chat.ts", "actions/dev-panel.ts", "actions/sorting.ts"]) {
    assert.match(read(file), /schoolLockError\(|assertSchoolNotLocked\(/, file);
  }
  assert.match(functionBody(read("actions/super-admin.ts"), "assignSchoolAdmin"), /superAdminLockedOut\(/);
});

test("actions using requireSchoolAdmin get the lock through it", () => {
  for (const file of [
    "actions/analytics.ts",
    "actions/blackbaud.ts",
    "actions/calendar-labels.ts",
    "actions/conflicts.ts",
    "actions/contact-folders.ts",
    "actions/contacts.ts",
    "actions/email-review.ts",
    "actions/website-sources.ts",
  ]) {
    assert.match(read(file), /from "@\/lib\/auth\/require-school-admin"/, file);
  }
});

test("interactive API routes check the owner lock", () => {
  for (const file of [
    "app/api/chat/route.ts",
    "app/api/blackbaud/connect/route.ts",
    "app/api/documents/[id]/content/route.ts",
    "app/api/documents/[id]/source/route.ts",
    "app/api/documents/[id]/status/route.ts",
    "app/api/documents/[id]/url/route.ts",
  ]) {
    assert.match(read(file), /schoolLockError\(/, file);
  }
});

function filesUnder(dir: string): string[] {
  const abs = path.join(root, dir);
  return readdirSync(abs).flatMap((name) => {
    const rel = path.join(dir, name);
    return statSync(path.join(root, rel)).isDirectory() ? filesUnder(rel) : [rel];
  });
}

test("service paths never consult the owner lock", () => {
  const servicePaths = [
    ...filesUnder("app/api/cron"),
    ...filesUnder("app/api/inbound-email"),
    "app/api/process-document/route.ts",
    "app/api/blackbaud/oauth/callback/route.ts",
    ...filesUnder("lib/email").filter((f) => !f.endsWith(".test.ts")),
    ...filesUnder("lib/blackbaud").filter((f) => !f.endsWith(".test.ts")),
    ...filesUnder("lib/ai").filter((f) => !f.endsWith(".test.ts")),
  ].filter((f) => /\.tsx?$/.test(f));
  assert.ok(servicePaths.length > 10);
  for (const file of servicePaths) {
    assert.doesNotMatch(read(file), /school-lock/, `${file} must not depend on the owner lock`);
  }
});

test("the lock hash never leaves the server", () => {
  const page = read("app/s/[slug]/(dashboard)/admin/settings/security/page.tsx");
  assert.doesNotMatch(page, /passwordHash:/);
  assert.doesNotMatch(read("components/admin/settings/owner-lock-settings.tsx"), /password_hash|passwordHash/);
  const migration = read("supabase/migrations/050_school_owner_locks.sql");
  assert.match(migration, /REVOKE ALL ON public\.school_owner_locks FROM anon, authenticated/);
  assert.match(migration, /ALTER TABLE public\.school_owner_locks ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(migration, /CREATE POLICY/i);
});
