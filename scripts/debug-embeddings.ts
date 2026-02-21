/**
 * Debug script: check why response doc embeddings don't match queries.
 * Run: npx tsx --env-file=.env.local scripts/debug-embeddings.ts
 */
import { generateEmbedding } from "@/lib/ai/embeddings";
import { createAdminClient } from "@/lib/supabase/admin";

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

async function main() {
  const supabase = createAdminClient();
  const query = "when is the next polo match";
  const schoolId = "d8314a70-3db8-4f83-8330-f97209494821";

  console.log("1. Generating query embedding...");
  const queryEmb = await generateEmbedding(query);
  console.log(`   dims: ${queryEmb.length}`);

  // 2. Count total chunks for this school
  const { count } = await supabase
    .from("document_chunks")
    .select("id", { count: "exact", head: true })
    .eq("school_id", schoolId);
  console.log(`\n2. Total chunks for school: ${count}`);

  // 3. Test RPC with threshold 0.0 and high limit
  console.log("\n3. RPC test (threshold=0.0, limit=200)...");
  const { data: rpcResult, error: rpcErr } = await supabase.rpc("match_document_chunks", {
    query_embedding: JSON.stringify(queryEmb),
    p_school_id: schoolId,
    match_threshold: 0.0,
    match_count: 200,
  });

  if (rpcErr) {
    console.log("   RPC error:", rpcErr.message);
    return;
  }

  console.log(`   RPC returned ${rpcResult?.length} total chunks`);

  // Show top 10
  console.log("\n   Top 10 RPC results:");
  for (let i = 0; i < Math.min(10, rpcResult?.length || 0); i++) {
    const c = rpcResult![i];
    console.log(`   [${i}] doc_id=${c.document_id} sim=${c.similarity.toFixed(4)} "${c.content.slice(0, 60)}..."`);
  }

  // Show bottom 5
  if (rpcResult && rpcResult.length > 10) {
    console.log(`\n   Bottom 5 RPC results:`);
    for (let i = Math.max(0, rpcResult.length - 5); i < rpcResult.length; i++) {
      const c = rpcResult[i];
      console.log(`   [${i}] doc_id=${c.document_id} sim=${c.similarity.toFixed(4)} "${c.content.slice(0, 60)}..."`);
    }
  }

  // Check for response docs
  const { data: responseDocs } = await supabase
    .from("documents")
    .select("id, title")
    .eq("school_id", schoolId)
    .contains("tags", ["response"]);

  const docIds = responseDocs?.map(d => d.id) || [];
  const responseHits = rpcResult?.filter((c: { document_id: string }) => docIds.includes(c.document_id));
  console.log(`\n   Response doc hits in RPC: ${responseHits?.length}`);
  for (const hit of responseHits || []) {
    const doc = responseDocs?.find(d => d.id === hit.document_id);
    console.log(`     "${doc?.title}" sim=${hit.similarity.toFixed(4)}`);
  }

  // 4. Check if response doc chunks even exist in the DB with matching school_id
  console.log("\n4. Direct chunk query for response docs...");
  for (const doc of responseDocs || []) {
    const { data: chunks, error: chunkErr } = await supabase
      .from("document_chunks")
      .select("id, school_id, chunk_index")
      .eq("document_id", doc.id);

    if (chunkErr) {
      console.log(`   Doc "${doc.title}": ERROR ${chunkErr.message}`);
    } else if (!chunks || chunks.length === 0) {
      console.log(`   Doc "${doc.title}" (${doc.id}): NO CHUNKS FOUND`);
    } else {
      console.log(`   Doc "${doc.title}" (${doc.id}): ${chunks.length} chunks, school_ids: [${chunks.map(c => c.school_id)}]`);
    }
  }

  // 5. Check documents table status for response docs
  console.log("\n5. Response doc status check...");
  for (const doc of responseDocs || []) {
    const { data: fullDoc } = await supabase
      .from("documents")
      .select("id, title, status, school_id")
      .eq("id", doc.id)
      .single();
    console.log(`   "${fullDoc?.title}": status=${fullDoc?.status}, school_id=${fullDoc?.school_id}`);
  }

  // 6. Manual similarity test — use the SAME query embedding against response chunk embeddings
  console.log("\n6. Manual similarity for response doc chunks...");
  for (const doc of responseDocs || []) {
    const { data: chunks } = await supabase
      .from("document_chunks")
      .select("id, content, embedding")
      .eq("document_id", doc.id);

    for (const chunk of chunks || []) {
      let chunkEmb: number[];
      if (typeof chunk.embedding === "string") {
        chunkEmb = JSON.parse(chunk.embedding);
      } else {
        chunkEmb = chunk.embedding;
      }
      const sim = cosineSimilarity(queryEmb, chunkEmb);
      console.log(`   "${doc.title}" chunk ${chunk.id}: manual_sim=${sim.toFixed(4)}, dims=${chunkEmb.length}, content="${chunk.content.slice(0, 60)}..."`);
    }
  }
}

main().catch(console.error);
