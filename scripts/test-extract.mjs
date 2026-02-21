// Quick test to check memory usage during PDF extraction
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const docId = "54faac70-44d8-40fb-9e36-ea27733b3ebe";

// Fetch doc
const { data: doc } = await supabase.from("documents").select("*").eq("id", docId).single();
console.log("Doc:", doc.title, doc.file_type, doc.file_url);

// Download
const { data: fileData } = await supabase.storage.from("documents").download(doc.file_url);
const buffer = Buffer.from(await fileData.arrayBuffer());
console.log("Buffer size:", buffer.length);
console.log("Memory before extraction:", Math.round(process.memoryUsage().rss / 1024 / 1024), "MB");

// Extract text
const { parseOffice } = await import("officeparser");
const ast = await parseOffice(buffer);
const text = ast.toText();
console.log("Text length:", text.length);
console.log("Text preview:", text.slice(0, 500));
console.log("Memory after extraction:", Math.round(process.memoryUsage().rss / 1024 / 1024), "MB");

// Test chunking
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;
const cleaned = text.replace(/\s+/g, " ").trim();
console.log("Cleaned text length:", cleaned.length);

let chunkCount = 0;
let start = 0;
while (start < cleaned.length) {
  let end = Math.min(start + CHUNK_SIZE, cleaned.length);
  chunkCount++;
  start = end - CHUNK_OVERLAP;
  if (start >= cleaned.length) break;
}
console.log("Chunk count:", chunkCount);
console.log("Memory after chunking:", Math.round(process.memoryUsage().rss / 1024 / 1024), "MB");
