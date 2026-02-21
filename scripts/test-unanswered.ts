import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env.local') });

import { createClient } from '@supabase/supabase-js';
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function main() {
  const { data: schools } = await sb.from('schools').select('id, name').limit(1);
  console.log('School:', schools?.[0]);
  if (!schools?.length) process.exit(1);

  const schoolId = schools[0].id;

  // Use AI SDK for embedding (same as the app)
  const { embed } = await import('ai');
  const { google } = await import('@ai-sdk/google');
  const { embedding } = await embed({
    model: google.embedding('gemini-embedding-001'),
    value: 'when is the polo season start',
    providerOptions: { google: { outputDimensionality: 768 } },
  });
  console.log('Embedding length:', embedding?.length);

  // Search with same params as the chat route
  const { data: chunks, error } = await sb.rpc('match_document_chunks', {
    query_embedding: JSON.stringify(embedding),
    p_school_id: schoolId,
    match_threshold: 0.5,
    match_count: 8,
  });

  console.log('Search error:', error?.message || 'none');
  console.log('Chunks found:', chunks?.length || 0);
  if (chunks?.length) {
    for (const c of chunks) {
      console.log(`  - sim: ${c.similarity.toFixed(3)} | doc: ${c.document_id} | content: "${c.content.slice(0, 60)}..."`);
    }

    // Check how many pass the 0.65 threshold (same as sources filter)
    const above65 = chunks.filter((c: any) => c.similarity >= 0.65);
    console.log(`\nChunks >= 0.65 similarity: ${above65.length}`);
    console.log(`sources.length would be: ${above65.length > 0 ? 'non-zero (unanswered NOT recorded)' : '0 (unanswered WOULD be recorded)'}`);
  } else {
    console.log('No chunks found at all — sources.length = 0 — unanswered WOULD be recorded');
  }
}

main().catch(console.error);
