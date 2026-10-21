/**
 * Scan a school's documents for conflicting statements — the same scan as
 * Admin > Conflicts > "Scan for conflicts" (lib/conflicts/scan.ts).
 *
 * Pairs whose documents are from different school years (years.ts) are not
 * sent to Gemini; they're counted as skipped different_year and listed last.
 *
 * Usage:
 *   npx tsx scripts/scan-conflicts.ts <school-id>                # dry run: print only
 *   npx tsx scripts/scan-conflicts.ts <school-id> --limit 10     # judge at most 10 pairs
 *   npx tsx scripts/scan-conflicts.ts <school-id> --json out.json # dry run, judgments also saved as JSON
 *   npx tsx scripts/scan-conflicts.ts <school-id> --write        # store judgments + a scan run
 *
 * A dry run still calls Gemini for each judged pair (that's the point: see
 * what it would decide) but writes nothing to the database — no conflicts, no
 * judged-pair records, no scan run. Documents are only read.
 *
 * A dry run works before migration 046_document_conflicts.sql is applied:
 * without the find_conflict_candidates function it reads every chunk's
 * embedding and finds near neighbours in memory (lib/conflicts/knn.ts) —
 * slower, and it reads the whole school, but the same candidates. --write
 * needs 046.
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and
 * GOOGLE_GENERATIVE_AI_API_KEY from the process env, or .env.local if present.
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local"), quiet: true });

import { writeFileSync } from "fs";
import { createAdminClient } from "@/lib/supabase/admin";
import { isNotInstalledError } from "@/lib/supabase/not-installed";
import { DEFAULT_MAX_JUDGED, DEFAULT_SIMILARITY_THRESHOLD, scanSchoolConflicts } from "@/lib/conflicts/scan";

function parseArgs(argv: string[]) {
  let schoolId: string | undefined;
  let write = false;
  let limit = DEFAULT_MAX_JUDGED;
  let json: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--write") write = true;
    else if (arg === "--limit") limit = Number(argv[++i]);
    else if (arg.startsWith("--limit=")) limit = Number(arg.slice("--limit=".length));
    else if (arg === "--json") json = argv[++i];
    else if (arg.startsWith("--json=")) json = arg.slice("--json=".length);
    else if (!arg.startsWith("--")) schoolId = arg;
  }
  return { schoolId, write, limit, json };
}

const clip = (s: string, n = 220) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

async function main() {
  const { schoolId, write, limit, json } = parseArgs(process.argv.slice(2));
  if (
    !schoolId ||
    !/^[0-9a-f-]{36}$/i.test(schoolId) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    (json !== undefined && !json)
  ) {
    console.error("Usage: tsx scripts/scan-conflicts.ts <school-id> [--write] [--limit N] [--json <path>]");
    process.exit(1);
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env");
    process.exit(1);
  }

  const supabase = createAdminClient();
  const { data: school, error } = await supabase
    .from("schools")
    .select("id, name")
    .eq("id", schoolId)
    .maybeSingle();
  if (error || !school) {
    console.error("School not found:", error?.message ?? schoolId);
    process.exit(1);
  }

  if (write) {
    // Refuse up front rather than judge pairs there's nowhere to store.
    const probes = await Promise.all([
      supabase.from("document_conflicts").select("id").limit(1),
      supabase.from("conflict_scan_runs").select("id").limit(1),
    ]);
    if (probes.some((p) => isNotInstalledError(p.error))) {
      console.error(
        "--write needs migration 046_document_conflicts.sql, which isn't applied to this database.\n" +
          "Apply it first (see docs/CONFLICTS.md), or run without --write for a dry run."
      );
      process.exit(1);
    }
  }

  console.log(`${write ? "WRITE" : "DRY RUN"} — ${school.name} (${school.id}), judging up to ${limit} pairs`);
  const result = await scanSchoolConflicts(supabase, schoolId, {
    write,
    trigger: "script",
    maxJudged: limit,
    inMemoryFallback: true,
    log: (message) => console.log(message),
  });
  if (!result.installed) {
    console.error(
      write
        ? "--write needs migration 046_document_conflicts.sql: apply it first, or run without --write for a dry run."
        : "Conflict detection isn't installed (migration 046)."
    );
    process.exit(1);
  }
  if (result.inMemory) console.log("(Candidates found in memory: migration 046 isn't applied.)");

  console.log(
    `Scanned ${result.documentsScanned} documents: ${result.pairsConsidered} candidate pairs, ${result.pairsJudged} judged, ${result.conflictsFound} conflicts.`
  );
  const skipped = Object.entries(result.skipped);
  if (skipped.length > 0) {
    console.log(`Skipped: ${skipped.map(([reason, n]) => `${reason} ${n}`).join(", ")}`);
  }
  const dismissed = Object.entries(result.autoDismissed);
  if (dismissed.length > 0) {
    console.log(
      `Called conflicts but auto-dismissed: ${dismissed.map(([reason, n]) => `${reason} ${n}`).join(", ")}`
    );
  }
  if (result.skipped.different_year) {
    console.log(`(${result.skipped.different_year} different_year pair(s) auto-dismissed without judging are listed last.)`);
  }

  for (const j of result.judged) {
    const verdict =
      j.status === "open" ? "CONFLICT" : j.reason ? `not kept (${j.reason})` : "no conflict";
    console.log(
      `\n- [${verdict}] ${j.topic || "(no topic)"} — similarity ${j.similarity.toFixed(3)}, confidence ${j.confidence.toFixed(2)}\n  A: ${j.documentA}\n  B: ${j.documentB}`
    );
    if (j.description) console.log(`  ${clip(j.description, 400)}`);
    if (j.statementA) console.log(`  A says: "${clip(j.statementA)}"`);
    if (j.statementB) console.log(`  B says: "${clip(j.statementB)}"`);
    if (j.verification) {
      const v = j.verification;
      console.log(`  Verifier: ${v.verdict} (confidence ${v.confidence.toFixed(2)}) — ${clip(v.reason, 400)}`);
    }
  }

  if (json) {
    const report = {
      school: { id: school.id, name: school.name },
      mode: write ? "write" : "dry_run",
      candidateSource: result.inMemory ? "in_memory" : "database",
      threshold: DEFAULT_SIMILARITY_THRESHOLD,
      generatedAt: new Date().toISOString(),
      documentsScanned: result.documentsScanned,
      pairsConsidered: result.pairsConsidered,
      pairsJudged: result.pairsJudged,
      conflictsFound: result.conflictsFound,
      skipped: result.skipped,
      autoDismissed: result.autoDismissed,
      truncated: result.truncated,
      error: result.error ?? null,
      judgments: result.judged.map((j) => ({
        similarity: j.similarity,
        judged_by_model: j.judgedByModel,
        is_conflict: j.isConflict,
        status: j.status,
        reason: j.reason ?? null,
        confidence: j.confidence,
        verifier: j.verification ?? null,
        topic: j.topic,
        description: j.description,
        a: {
          document_id: j.documentAId,
          title: j.documentA,
          file_type: j.documentAType,
          source: j.documentASource,
          chunk_id: j.chunkAId,
          chunk_index: j.chunkAIndex,
          statement: j.statementA,
        },
        b: {
          document_id: j.documentBId,
          title: j.documentB,
          file_type: j.documentBType,
          source: j.documentBSource,
          chunk_id: j.chunkBId,
          chunk_index: j.chunkBIndex,
          statement: j.statementB,
        },
      })),
    };
    writeFileSync(json, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`\nWrote ${result.judged.length} judgment(s) to ${json}`);
  }

  if (result.error) {
    console.error("\nFailed:", result.error);
    process.exit(1);
  }
  console.log(
    write
      ? `\nStored ${result.pairsJudged} judged pair(s). Review open conflicts in Admin > Conflicts.`
      : "\nDry run — nothing written. Re-run with --write to store these judgments."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
