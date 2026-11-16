import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { MIGRATIONS_DIR, migratedDatabase } from "./harness";

// Migration 053 on a database that already has addresses and ingestions:
// the intake_address_ids backfill (division addresses only), that it can be
// run again, and that a deleted address can't be switched back on.

const SCHOOL = "11111111-1111-4111-8111-111111111111";
const ADMIN = "a0000000-0000-4000-8000-000000000001";
const LOWER = "c0000000-0000-4000-8000-000000000001";
const MIDDLE = "c0000000-0000-4000-8000-000000000002";
const ADDR_SCHOOL = "e0000000-0000-4000-8000-000000000001";
const ADDR_LOWER = "e0000000-0000-4000-8000-000000000002";
const ADDR_MIDDLE = "e0000000-0000-4000-8000-000000000003";
const ADDR_LIST = "e0000000-0000-4000-8000-000000000004";
const ING_HELD_LOWER = "f0000000-0000-4000-8000-000000000001";
const ING_HELD_BOTH = "f0000000-0000-4000-8000-000000000002";
const ING_PLAIN = "f0000000-0000-4000-8000-000000000003";

const MIGRATION_053 = readFileSync(path.join(MIGRATIONS_DIR, "053_intake_address_delete.sql"), "utf8");

let db: PGlite;

before(async () => {
  db = await migratedDatabase({ upTo: "052_retire_unscoped_retrieval.sql" });
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ('${ADMIN}', 'admin@x.org') ON CONFLICT DO NOTHING;
    INSERT INTO public.profiles (id, email, full_name, role) VALUES ('${ADMIN}', 'admin@x.org', 'A', 'admin')
      ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
    INSERT INTO public.schools (id, name, slug) VALUES ('${SCHOOL}', 'Collegiate', 'collegiate');
    INSERT INTO public.event_calendars (id, school_id, kind, name, color, sort_order) VALUES
      ('${LOWER}', '${SCHOOL}', 'division', 'Lower School', 'blue', 0),
      ('${MIDDLE}', '${SCHOOL}', 'division', 'Middle School', 'green', 1);
    INSERT INTO public.email_ingestion_addresses (id, school_id, token, kind, division_id) VALUES
      ('${ADDR_SCHOOL}', '${SCHOOL}', 'ams-school', 'school', NULL),
      ('${ADDR_LOWER}', '${SCHOOL}', 'ams-lower', 'division', '${LOWER}'),
      ('${ADDR_MIDDLE}', '${SCHOOL}', 'ams-middle', 'division', '${MIDDLE}');
    INSERT INTO public.email_ingestion_addresses (id, school_id, token, kind, label, visible_grades) VALUES
      ('${ADDR_LIST}', '${SCHOOL}', 'ams-g5', 'list', 'Grade 5', ARRAY['5']);
    INSERT INTO public.email_ingestions (id, school_id, status, division_ids, document_ids) VALUES
      ('${ING_HELD_LOWER}', '${SCHOOL}', 'accepted', ARRAY['${LOWER}']::uuid[], '{}'),
      ('${ING_HELD_BOTH}', '${SCHOOL}', 'accepted', ARRAY['${LOWER}', '${MIDDLE}']::uuid[], '{}'),
      ('${ING_PLAIN}', '${SCHOOL}', 'accepted', '{}', '{}');
  `);
  await db.exec(MIGRATION_053);
});

after(async () => {
  await db?.close();
});

async function addressIds(id: string): Promise<string[] | null> {
  const { rows } = await db.query<{ intake_address_ids: string[] | null }>(
    "SELECT intake_address_ids FROM public.email_ingestions WHERE id = $1",
    [id]
  );
  return rows[0].intake_address_ids ? [...rows[0].intake_address_ids].sort() : null;
}

test("053 backfills division addresses from division_ids, and guesses nothing else", async () => {
  assert.deepEqual(await addressIds(ING_HELD_LOWER), [ADDR_LOWER]);
  assert.deepEqual(await addressIds(ING_HELD_BOTH), [ADDR_LOWER, ADDR_MIDDLE].sort());
  assert.equal(await addressIds(ING_PLAIN), null);
});

test("053 can be applied again without changing anything", async () => {
  await db.exec(`UPDATE public.email_ingestions SET intake_address_ids = ARRAY['${ADDR_LIST}']::uuid[] WHERE id = '${ING_HELD_LOWER}'`);
  await db.exec(MIGRATION_053);
  assert.deepEqual(await addressIds(ING_HELD_LOWER), [ADDR_LIST]);
  assert.deepEqual(await addressIds(ING_HELD_BOTH), [ADDR_LOWER, ADDR_MIDDLE].sort());
});

test("a deleted address must be switched off, and keeps its division's slot", async () => {
  await assert.rejects(
    db.exec(`UPDATE public.email_ingestion_addresses SET deleted_at = now() WHERE id = '${ADDR_LIST}'`),
    /deleted_off_check/
  );
  await db.exec(`
    UPDATE public.email_ingestion_addresses SET deleted_at = now(), deleted_by = '${ADMIN}', enabled = false
    WHERE id IN ('${ADDR_LIST}', '${ADDR_MIDDLE}');
  `);
  await assert.rejects(
    db.exec(`UPDATE public.email_ingestion_addresses SET enabled = true WHERE id = '${ADDR_LIST}'`),
    /deleted_off_check/
  );
  await assert.rejects(
    db.exec(`INSERT INTO public.email_ingestion_addresses (school_id, token, kind, division_id) VALUES ('${SCHOOL}', 'ams-middle2', 'division', '${MIDDLE}')`),
    /duplicate key/
  );
});

test("the intake_address_ids index exists", async () => {
  const { rows } = await db.query<{ indexname: string }>(
    "SELECT indexname FROM pg_indexes WHERE tablename = 'email_ingestions' AND indexname = 'idx_email_ingestions_intake_address_ids'"
  );
  assert.equal(rows.length, 1);
});
