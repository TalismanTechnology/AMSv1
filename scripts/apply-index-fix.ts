/**
 * Apply migration 015: Replace IVFFlat index with HNSW
 * Run: npx tsx --env-file=.env.local scripts/apply-index-fix.ts
 */
import { createAdminClient } from "@/lib/supabase/admin";

async function main() {
  const supabase = createAdminClient();

  console.log("Dropping IVFFlat index...");
  const { error: dropErr } = await supabase.rpc("exec_sql", {
    sql: "DROP INDEX IF EXISTS document_chunks_embedding_idx;",
  });

  if (dropErr) {
    // If exec_sql doesn't exist, try via raw query workaround
    console.log("exec_sql not available, trying alternative...");
    // Use a known workaround: create a temp function
    const { error: funcErr } = await supabase.rpc("exec_sql", {
      query: "DROP INDEX IF EXISTS document_chunks_embedding_idx;",
    });
    if (funcErr) {
      console.log("Cannot run SQL via RPC. Run this SQL directly in Supabase SQL Editor:");
      console.log("");
      console.log("DROP INDEX IF EXISTS document_chunks_embedding_idx;");
      console.log("CREATE INDEX document_chunks_embedding_idx ON public.document_chunks USING hnsw (embedding vector_cosine_ops);");
      console.log("");
      console.log("Or as a quick fix, run this to set probes higher:");
      console.log("ALTER FUNCTION match_document_chunks SET ivfflat.probes = 20;");
    }
    return;
  }

  console.log("Creating HNSW index...");
  const { error: createErr } = await supabase.rpc("exec_sql", {
    sql: "CREATE INDEX document_chunks_embedding_idx ON public.document_chunks USING hnsw (embedding vector_cosine_ops);",
  });

  if (createErr) {
    console.log("Error creating HNSW index:", createErr.message);
    return;
  }

  console.log("Done! Index replaced.");
}

main().catch(console.error);
