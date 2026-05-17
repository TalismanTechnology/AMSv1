/**
 * Reprocess all documents for a given school.
 *
 * Usage:
 *   npx tsx scripts/reprocess-school.ts "<name pattern>"          # dry run
 *   npx tsx scripts/reprocess-school.ts "<name pattern>" --run    # actually reprocess
 *
 * The name pattern is matched case-insensitively against schools.name.
 * Reprocessing deletes existing chunks and re-runs the full extraction
 * pipeline (with current parser improvements) for every document.
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env");
  process.exit(1);
}

const pattern = process.argv[2];
const doRun = process.argv.includes("--run");

if (!pattern) {
  console.error('Usage: tsx scripts/reprocess-school.ts "<name pattern>" [--run]');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

async function main() {
  // 1. Find the school
  const { data: schools, error: schoolErr } = await admin
    .from("schools")
    .select("id, name, slug")
    .ilike("name", `%${pattern}%`);

  if (schoolErr) {
    console.error("School lookup failed:", schoolErr);
    process.exit(1);
  }

  if (!schools?.length) {
    console.error(`No schools matched "${pattern}"`);
    process.exit(1);
  }

  if (schools.length > 1) {
    console.error(`Multiple schools matched "${pattern}":`);
    schools.forEach((s) => console.error(`  - ${s.name} (${s.slug})`));
    console.error("Refine the pattern to match exactly one school.");
    process.exit(1);
  }

  const school = schools[0];
  console.log(`School: ${school.name} (${school.slug}) id=${school.id}`);

  // 2. List all documents
  const { data: docs, error: docErr } = await admin
    .from("documents")
    .select("id, title, file_type, status")
    .eq("school_id", school.id);

  if (docErr) {
    console.error("Document list failed:", docErr);
    process.exit(1);
  }

  if (!docs?.length) {
    console.log("No documents to reprocess.");
    return;
  }

  console.log(`Documents (${docs.length}):`);
  const byStatus: Record<string, number> = {};
  docs.forEach((d) => {
    byStatus[d.status] = (byStatus[d.status] || 0) + 1;
  });
  Object.entries(byStatus).forEach(([s, n]) => console.log(`  ${s}: ${n}`));

  if (!doRun) {
    console.log("\nDry run. Re-run with --run to actually reprocess.");
    return;
  }

  // 3. Mark all as processing, delete existing chunks
  const ids = docs.map((d) => d.id);
  console.log(`\nClearing chunks for ${ids.length} documents...`);
  const { error: delErr } = await admin
    .from("document_chunks")
    .delete()
    .in("document_id", ids);
  if (delErr) {
    console.error("Chunk delete failed:", delErr);
    process.exit(1);
  }

  await admin
    .from("documents")
    .update({ status: "processing", error_message: null })
    .in("id", ids);

  // 4. Process one at a time (sequential to bound memory + API quota)
  const { processDocument } = await import("../lib/documents/processor");
  let ok = 0;
  let failed = 0;
  for (let i = 0; i < docs.length; i++) {
    const d = docs[i];
    console.log(`\n[${i + 1}/${docs.length}] ${d.title} (${d.file_type})`);
    try {
      const result = await processDocument(d.id);
      console.log(`  ok: ${result.chunkCount} chunks`);
      ok++;
    } catch (err) {
      console.error(`  failed:`, err instanceof Error ? err.message : err);
      failed++;
    }
  }

  console.log(`\nDone. Succeeded: ${ok}. Failed: ${failed}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
