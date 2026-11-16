import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { as, migratedDatabase } from "./harness";

// Migrations 001…052 applied to an in-memory Postgres, then every database
// path a parent could use to reach a document checked for a grade-9 parent
// against a grade-10-only document (migration 051).

const SCHOOL = "11111111-1111-4111-8111-111111111111";
const OTHER_SCHOOL = "22222222-2222-4222-8222-222222222222";
const ADMIN = "a0000000-0000-4000-8000-000000000001";
const SUPER = "a0000000-0000-4000-8000-000000000002";
const P9 = "b0000000-0000-4000-8000-000000000009";
const P10 = "b0000000-0000-4000-8000-000000000010";
const NO_KIDS = "b0000000-0000-4000-8000-000000000000";
const GRADUATED = "b0000000-0000-4000-8000-000000000012";
const OUTSIDER = "b0000000-0000-4000-8000-0000000000ff";
const DOC_OPEN = "d0000000-0000-4000-8000-000000000001";
const DOC_G10 = "d0000000-0000-4000-8000-000000000010";

/** A 768-dimensional unit vector along `axis`. */
const vec = (axis: number) =>
  `[${Array.from({ length: 768 }, (_, i) => (i === axis ? 1 : 0)).join(",")}]`;

let db: PGlite;

before(async () => {
  db = await migratedDatabase();
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${ADMIN}', 'admin@x.org'), ('${SUPER}', 'super@x.org'),
      ('${P9}', 'p9@x.org'), ('${P10}', 'p10@x.org'), ('${NO_KIDS}', 'none@x.org'),
      ('${GRADUATED}', 'grad@x.org'), ('${OUTSIDER}', 'out@x.org')
    ON CONFLICT DO NOTHING;
    INSERT INTO public.profiles (id, email, full_name, role) VALUES
      ('${ADMIN}', 'admin@x.org', 'A', 'admin'), ('${SUPER}', 'super@x.org', 'S', 'super_admin'),
      ('${P9}', 'p9@x.org', 'P9', 'parent'), ('${P10}', 'p10@x.org', 'P10', 'parent'),
      ('${NO_KIDS}', 'none@x.org', 'N', 'parent'), ('${GRADUATED}', 'grad@x.org', 'G', 'parent'),
      ('${OUTSIDER}', 'out@x.org', 'O', 'parent')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
    INSERT INTO public.schools (id, name, slug) VALUES
      ('${SCHOOL}', 'Collegiate', 'collegiate'), ('${OTHER_SCHOOL}', 'Other', 'other');
    INSERT INTO public.school_memberships (user_id, school_id, role, approved) VALUES
      ('${ADMIN}', '${SCHOOL}', 'admin', true),
      ('${P9}', '${SCHOOL}', 'parent', true), ('${P10}', '${SCHOOL}', 'parent', true),
      ('${NO_KIDS}', '${SCHOOL}', 'parent', true), ('${GRADUATED}', '${SCHOOL}', 'parent', true),
      ('${OUTSIDER}', '${OTHER_SCHOOL}', 'parent', true);
    INSERT INTO public.children (parent_id, school_id, name, grade, graduated_at) VALUES
      ('${P9}', '${SCHOOL}', 'Nine', '9', NULL),
      ('${P10}', '${SCHOOL}', 'Ten', '10', NULL),
      ('${GRADUATED}', '${SCHOOL}', 'Grad', '10', NULL),
      ('${OUTSIDER}', '${OTHER_SCHOOL}', 'Elsewhere', '10', NULL);
    -- Writing a grade clears graduated_at (043's trigger), so graduate after.
    UPDATE public.children SET graduated_at = now() WHERE parent_id = '${GRADUATED}';
    INSERT INTO public.documents (id, school_id, title, file_name, file_type, file_url, status, source, visible_grades) VALUES
      ('${DOC_OPEN}', '${SCHOOL}', 'Weekly update', 'weekly.txt', 'txt', '${SCHOOL}/email/weekly.txt', 'ready', 'email', NULL),
      ('${DOC_G10}', '${SCHOOL}', 'Grade 10 trip', 'trip.txt', 'txt', '${SCHOOL}/email/trip.txt', 'ready', 'email', ARRAY['10']);
    INSERT INTO public.document_chunks (document_id, school_id, content, chunk_index, embedding, metadata) VALUES
      ('${DOC_OPEN}', '${SCHOOL}', 'Weekly update: picture day is Friday', 0, '${vec(0)}', '{}'),
      ('${DOC_G10}', '${SCHOOL}', 'Grade ten field trip permission slip due Friday', 0, '${vec(0)}', '{}');
    INSERT INTO storage.objects (bucket_id, name) VALUES
      ('documents', '${SCHOOL}/email/trip.txt');
  `);
});

after(async () => {
  await db?.close();
});

const ids = (rows: Record<string, unknown>[], key = "id") => rows.map((r) => r[key] as string).sort();

// ── RLS: documents / document_chunks / storage with the user's session ──

test("RLS documents: a grade-9 parent can't select the grade-10-only document", async () => {
  const seen = await as(db, "authenticated", P9, (q) => q("SELECT id FROM public.documents"));
  assert.deepEqual(ids(seen), [DOC_OPEN]);
  const direct = await as(db, "authenticated", P9, (q) =>
    q("SELECT id FROM public.documents WHERE id = $1", [DOC_G10])
  );
  assert.equal(direct.length, 0);
});

test("RLS documents: grade-10 parent, admin and super-admin see it", async () => {
  for (const user of [P10, ADMIN, SUPER]) {
    const seen = await as(db, "authenticated", user, (q) =>
      q("SELECT id FROM public.documents WHERE school_id = $1", [SCHOOL])
    );
    assert.deepEqual(ids(seen), [DOC_OPEN, DOC_G10].sort(), user);
  }
});

test("RLS documents: no children, graduated child, other school, anon", async () => {
  for (const user of [NO_KIDS, GRADUATED]) {
    const seen = await as(db, "authenticated", user, (q) => q("SELECT id FROM public.documents"));
    assert.deepEqual(ids(seen), [DOC_OPEN], user);
  }
  const outsider = await as(db, "authenticated", OUTSIDER, (q) => q("SELECT id FROM public.documents"));
  assert.deepEqual(outsider, []);
  const anon = await as(db, "anon", null, (q) => q("SELECT id FROM public.documents"));
  assert.deepEqual(anon, []);
});

test("RLS document_chunks: a grade-9 parent can't read the grade-10 chunks", async () => {
  const p9 = await as(db, "authenticated", P9, (q) => q("SELECT document_id FROM public.document_chunks"));
  assert.deepEqual(ids(p9, "document_id"), [DOC_OPEN]);
  const p10 = await as(db, "authenticated", P10, (q) => q("SELECT document_id FROM public.document_chunks"));
  assert.deepEqual(ids(p10, "document_id"), [DOC_OPEN, DOC_G10].sort());
});

test("storage: parents can't read stored files directly (only admins can)", async () => {
  const p10 = await as(db, "authenticated", P10, (q) => q("SELECT name FROM storage.objects"));
  assert.deepEqual(p10, []);
  const admin = await as(db, "authenticated", ADMIN, (q) => q("SELECT name FROM storage.objects"));
  assert.equal(admin.length, 1);
});

test("a parent can't widen a document's visibility themselves", async () => {
  const changed = await as(db, "authenticated", P9, (q) =>
    q("UPDATE public.documents SET visible_grades = NULL WHERE id = $1 RETURNING id", [DOC_G10])
  );
  assert.deepEqual(changed, []);
});

// ── Retrieval functions ───────────────────────────────────────────────

const matchSql = `SELECT document_id FROM public.match_document_chunks_v2($1::extensions.vector, $2::uuid, $3::uuid, 0.1, 10)`;
const searchSql = `SELECT document_id FROM public.search_document_chunks_v2($1::uuid, 'friday', $2::uuid, 10)`;

test("match_document_chunks_v2 (service role, as the chat runs): grade 9 gets no grade-10 chunk", async () => {
  const run = (viewer: string | null) =>
    as(db, "service_role", null, (q) => q(matchSql, [vec(0), SCHOOL, viewer]));
  assert.deepEqual(ids(await run(P9), "document_id"), [DOC_OPEN]);
  assert.deepEqual(ids(await run(P10), "document_id"), [DOC_OPEN, DOC_G10].sort());
  assert.deepEqual(ids(await run(ADMIN), "document_id"), [DOC_OPEN, DOC_G10].sort());
  assert.deepEqual(ids(await run(SUPER), "document_id"), [DOC_OPEN, DOC_G10].sort());
  assert.deepEqual(ids(await run(NO_KIDS), "document_id"), [DOC_OPEN]);
  assert.deepEqual(ids(await run(GRADUATED), "document_id"), [DOC_OPEN]);
  // Not a member of this school, or no viewer at all: nothing.
  assert.deepEqual(await run(OUTSIDER), []);
  assert.deepEqual(await run(null), []);
});

test("search_document_chunks_v2 (FTS, service role): grade 9 gets no grade-10 chunk", async () => {
  const run = (viewer: string | null) => as(db, "service_role", null, (q) => q(searchSql, [SCHOOL, viewer]));
  assert.deepEqual(ids(await run(P9), "document_id"), [DOC_OPEN]);
  assert.deepEqual(ids(await run(P10), "document_id"), [DOC_OPEN, DOC_G10].sort());
  assert.deepEqual(await run(OUTSIDER), []);
  assert.deepEqual(await run(null), []);
});

test("with a user's own session, auth.uid() is the viewer: naming someone else doesn't help", async () => {
  const match = await as(db, "authenticated", P9, (q) => q(matchSql, [vec(0), SCHOOL, P10]));
  assert.deepEqual(ids(match, "document_id"), [DOC_OPEN]);
  const search = await as(db, "authenticated", P9, (q) => q(searchSql, [SCHOOL, ADMIN]));
  assert.deepEqual(ids(search, "document_id"), [DOC_OPEN]);
});

test("the grade filter is applied before LIMIT (a restricted chunk never takes a slot)", async () => {
  const top1 = await as(db, "service_role", null, (q) =>
    q(`SELECT document_id FROM public.match_document_chunks_v2($1::extensions.vector, $2::uuid, $3::uuid, 0.1, 1)`, [vec(0), SCHOOL, P9])
  );
  assert.deepEqual(ids(top1, "document_id"), [DOC_OPEN]);
});

test("document_view_scope works out the viewer from the database", async () => {
  const scope = (viewer: string) =>
    as(db, "service_role", null, (q) =>
      q<{ allowed: boolean; see_all: boolean; grades: string[] }>(
        "SELECT * FROM public.document_view_scope($1::uuid, $2::uuid)",
        [viewer, SCHOOL]
      )
    );
  assert.deepEqual((await scope(P9))[0], { allowed: true, see_all: false, grades: ["9"] });
  assert.deepEqual((await scope(GRADUATED))[0], { allowed: true, see_all: false, grades: [] });
  assert.deepEqual((await scope(ADMIN))[0].see_all, true);
  assert.deepEqual((await scope(OUTSIDER))[0].allowed, false);
});

test("anon can't call the retrieval functions at all", async () => {
  await assert.rejects(as(db, "anon", null, (q) => q(searchSql, [SCHOOL, P10])), /permission denied/);
  await assert.rejects(as(db, "anon", null, (q) => q(matchSql, [vec(0), SCHOOL, P10])), /permission denied/);
});

test("after 052 the old unscoped functions are closed to every API role", async () => {
  for (const role of ["anon", "authenticated", "service_role"] as const) {
    await assert.rejects(
      as(db, role, role === "authenticated" ? P9 : null, (q) =>
        q(`SELECT * FROM public.match_document_chunks($1::extensions.vector, $2::uuid, 0.1, 10)`, [vec(0), SCHOOL])
      ),
      /permission denied/,
      role
    );
    await assert.rejects(
      as(db, role, role === "authenticated" ? P9 : null, (q) =>
        q(`SELECT * FROM public.search_document_chunks($1::uuid, 'friday', 10)`, [SCHOOL])
      ),
      /permission denied/,
      role
    );
  }
});

// ── Intake addresses ──────────────────────────────────────────────────

test("a school keeps one whole-school address but can add many list addresses", async () => {
  await db.exec(`
    INSERT INTO public.email_ingestion_addresses (school_id, token) VALUES ('${SCHOOL}', 'ams-e8d87e5b8c44');
    INSERT INTO public.email_ingestion_addresses (school_id, token, kind, label, visible_grades)
      VALUES ('${SCHOOL}', 'ams-g9', 'list', 'Grade 9', ARRAY['9']),
             ('${SCHOOL}', 'ams-g10', 'list', 'Grade 10', ARRAY['10']);
  `);
  const rows = await db.query<{ token: string; kind: string; enabled: boolean; visible_grades: string[] | null }>(
    "SELECT token, kind, enabled, visible_grades FROM public.email_ingestion_addresses ORDER BY token"
  );
  const legacy = rows.rows.find((r) => r.token === "ams-e8d87e5b8c44")!;
  assert.equal(legacy.kind, "school");
  assert.equal(legacy.enabled, true);
  assert.equal(legacy.visible_grades, null);
  await assert.rejects(
    db.exec(`INSERT INTO public.email_ingestion_addresses (school_id, token) VALUES ('${SCHOOL}', 'ams-second')`),
    /duplicate key/
  );
  await assert.rejects(
    db.exec(`INSERT INTO public.email_ingestion_addresses (school_id, token, kind, visible_grades) VALUES ('${SCHOOL}', 'ams-bad', 'list', ARRAY['13'])`),
    /visible_grades_check/
  );
});

test("documents.visible_grades only accepts real grades", async () => {
  await assert.rejects(
    db.exec(`UPDATE public.documents SET visible_grades = ARRAY['Grade 10'] WHERE id = '${DOC_G10}'`),
    /documents_visible_grades_check/
  );
});

// ── Deploy window: 051 applied, old code still running, 052 not yet ────

test("between 051 and 052 the old functions keep working, and a parent session is still filtered", async () => {
  const window = await migratedDatabase({ upTo: "051_intake_address_visibility.sql" });
  try {
    await window.exec(`
      INSERT INTO auth.users (id, email) VALUES ('${P9}', 'p9@x.org') ON CONFLICT DO NOTHING;
      INSERT INTO public.profiles (id, email, full_name, role) VALUES ('${P9}', 'p9@x.org', 'P9', 'parent')
        ON CONFLICT (id) DO NOTHING;
      INSERT INTO public.schools (id, name, slug) VALUES ('${SCHOOL}', 'Collegiate', 'collegiate');
      INSERT INTO public.school_memberships (user_id, school_id, role, approved) VALUES ('${P9}', '${SCHOOL}', 'parent', true);
      INSERT INTO public.children (parent_id, school_id, name, grade) VALUES ('${P9}', '${SCHOOL}', 'Nine', '9');
      INSERT INTO public.documents (id, school_id, title, file_name, file_type, file_url, status, visible_grades) VALUES
        ('${DOC_OPEN}', '${SCHOOL}', 'Open', 'a.txt', 'txt', 'a', 'ready', NULL),
        ('${DOC_G10}', '${SCHOOL}', 'G10', 'b.txt', 'txt', 'b', 'ready', ARRAY['10']);
      INSERT INTO public.document_chunks (document_id, school_id, content, chunk_index, embedding, metadata) VALUES
        ('${DOC_OPEN}', '${SCHOOL}', 'friday notes', 0, '${vec(0)}', '{}'),
        ('${DOC_G10}', '${SCHOOL}', 'friday trip', 0, '${vec(0)}', '{}');
    `);
    const oldSearch = `SELECT document_id FROM public.search_document_chunks($1::uuid, 'friday', 10)`;
    const oldMatch = `SELECT document_id FROM public.match_document_chunks($1::extensions.vector, $2::uuid, 0.1, 10)`;
    // The running deploy's content search (user session): RLS filters it.
    const parent = await as(window, "authenticated", P9, (q) => q(oldSearch, [SCHOOL]));
    assert.deepEqual(ids(parent, "document_id"), [DOC_OPEN]);
    const parentMatch = await as(window, "authenticated", P9, (q) => q(oldMatch, [vec(0), SCHOOL]));
    assert.deepEqual(ids(parentMatch, "document_id"), [DOC_OPEN]);
    // The running deploy's chat (service role) still gets results.
    const chat = await as(window, "service_role", null, (q) => q(oldMatch, [vec(0), SCHOOL]));
    assert.equal(chat.length, 2);
    // Anon never used them; now it can't.
    await assert.rejects(as(window, "anon", null, (q) => q(oldSearch, [SCHOOL])), /permission denied/);
  } finally {
    await window.close();
  }
});
