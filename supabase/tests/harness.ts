import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";

// Runs supabase/migrations/*.sql, in order, against an in-memory Postgres
// (PGlite) with just enough of Supabase around it: the anon / authenticated
// / service_role roles (service_role bypasses RLS, as on Supabase),
// auth.uid() read from request.jwt.claim.sub, and storage.objects. Lets
// tests check RLS and SQL functions as a given user.

export const MIGRATIONS_DIR = path.resolve(__dirname, "../migrations");

// Functions production created outside the migrations; 039 alters them.
const PROD_ONLY_TRIGGER_FUNCTIONS = [
  "check_inbound_address_division",
  "check_document_division",
  "check_category_parent",
  "check_row_category_school",
  "check_bb_event_suggested_category_school",
  "guard_profile_role",
  "seed_new_school_subdivisions",
  "rls_auto_enable",
];

const BOOTSTRAP = `
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA extensions;
CREATE EXTENSION vector SCHEMA extensions;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
  $$ SELECT current_setting('request.jwt.claim.role', true) $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;
CREATE SCHEMA storage;
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean,
  file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text, name text, owner uuid);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql AS
  $$ SELECT string_to_array(name, '/') $$;
CREATE PUBLICATION supabase_realtime;
GRANT USAGE ON SCHEMA public, extensions, auth, storage TO anon, authenticated, service_role;
-- Supabase's defaults: the API roles get table privileges, RLS decides rows.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
GRANT SELECT ON storage.objects TO anon, authenticated, service_role;
SET search_path = public, extensions;
`;

export async function migratedDatabase(
  opts: { upTo?: string } = {}
): Promise<PGlite> {
  const db = await PGlite.create({ extensions: { vector } });
  await db.exec(BOOTSTRAP);
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) => !opts.upTo || f <= opts.upTo);
  for (const file of files) {
    if (file.startsWith("039")) await stubProdOnlyFunctions(db);
    // CREATE INDEX CONCURRENTLY can't run in PGlite's implicit transaction.
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8").replace(/CONCURRENTLY /g, "");
    try {
      await db.exec(sql);
    } catch (err) {
      throw new Error(`${file}: ${err instanceof Error ? err.message : err}`);
    }
  }
  return db;
}

async function stubProdOnlyFunctions(db: PGlite) {
  for (const fn of PROD_ONLY_TRIGGER_FUNCTIONS) {
    await db.exec(`DO $$ BEGIN
      IF to_regprocedure('public.${fn}()') IS NULL THEN
        EXECUTE 'CREATE FUNCTION public.${fn}() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN RETURN NEW; END $f$';
      END IF;
    END $$;`);
  }
  await db.exec(`DO $$ BEGIN
    IF to_regprocedure('public.match_nearest_cluster(extensions.vector, uuid, double precision)') IS NULL THEN
      EXECUTE 'CREATE FUNCTION public.match_nearest_cluster(q extensions.vector, s uuid, t double precision) RETURNS int LANGUAGE sql AS $f$ SELECT 1 $f$';
    END IF;
  END $$;`);
}

/**
 * Run `fn` as a role, optionally as a signed-in user (auth.uid()), inside a
 * transaction that is rolled back.
 */
export async function as<T>(
  db: PGlite,
  role: "anon" | "authenticated" | "service_role",
  userId: string | null,
  fn: (q: <R = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<R[]>) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [userId ?? ""]);
    await tx.exec(`SET LOCAL ROLE ${role}`);
    const q = async <R>(sql: string, params: unknown[] = []) => (await tx.query<R>(sql, params)).rows;
    try {
      return await fn(q);
    } finally {
      await tx.rollback();
    }
  }) as Promise<T>;
}
