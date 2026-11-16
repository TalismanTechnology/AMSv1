import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { as, migratedDatabase } from "./harness";

// Migration 053: google_auth_sessions is service-role only. A signed-in user
// must never be able to mark their own session as a Google one (that would
// give a password session admin powers under ADMIN_GOOGLE_ONLY), nor read
// anyone's rows.

const USER = "a0000000-0000-4000-8000-000000000001";
const SESSION = "c0000000-0000-4000-8000-000000000001";

let db: PGlite;

before(async () => {
  db = await migratedDatabase();
  await db.exec(`INSERT INTO auth.users (id, email) VALUES ('${USER}', 'admin@x.org') ON CONFLICT DO NOTHING;`);
});

after(async () => {
  await db?.close();
});

test("the service role records and reads Google sessions", async () => {
  await as(db, "service_role", null, async (q) => {
    await q(`INSERT INTO public.google_auth_sessions (session_id, user_id, via) VALUES ($1, $2, 'web')`, [
      SESSION,
      USER,
    ]);
    const rows = await q(`SELECT user_id, via FROM public.google_auth_sessions WHERE session_id = $1`, [SESSION]);
    assert.deepEqual(rows, [{ user_id: USER, via: "web" }]);
  });
});

test("only 'web' and 'app' are valid", async () => {
  await assert.rejects(
    as(db, "service_role", null, (q) =>
      q(`INSERT INTO public.google_auth_sessions (session_id, user_id, via) VALUES ($1, $2, 'password')`, [
        SESSION,
        USER,
      ])
    ),
    /check constraint/
  );
});

for (const role of ["authenticated", "anon"] as const) {
  test(`${role} can neither insert nor read`, async () => {
    await assert.rejects(
      as(db, role, role === "anon" ? null : USER, (q) =>
        q(`INSERT INTO public.google_auth_sessions (session_id, user_id, via) VALUES ($1, $2, 'web')`, [
          SESSION,
          USER,
        ])
      ),
      /permission denied/
    );
    await assert.rejects(
      as(db, role, role === "anon" ? null : USER, (q) => q(`SELECT * FROM public.google_auth_sessions`)),
      /permission denied/
    );
  });
}
