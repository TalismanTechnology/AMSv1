/**
 * Standalone document processing worker.
 * Runs in a separate Node.js process to avoid OOM in the Turbopack dev server.
 * tsx resolves @/ path aliases natively from tsconfig.json.
 */

function logMem(label: string) {
  const mem = process.memoryUsage();
  const rss = Math.round(mem.rss / 1024 / 1024);
  const heap = Math.round(mem.heapUsed / 1024 / 1024);
  console.log(`[worker] [RSS: ${rss}MB, Heap: ${heap}MB] ${label}`);
}

const documentId = process.argv[2];

if (!documentId) {
  console.error("Usage: process-worker.ts <documentId>");
  process.exit(1);
}

// Safety timeout — kill process if it runs too long (5 minutes)
const TIMEOUT = 5 * 60 * 1000;
const timer = setTimeout(() => {
  console.error(`[worker] TIMEOUT: Process exceeded ${TIMEOUT / 1000}s, exiting`);
  process.exit(2);
}, TIMEOUT);
timer.unref();

logMem("Worker starting");

async function main() {
  logMem("Importing processor...");
  const { processDocument } = await import("@/lib/documents/processor");
  logMem("Processor imported");

  const result = await processDocument(documentId);
  logMem("Processing complete");
  console.log("[worker] Done:", JSON.stringify(result));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[worker] Failed:", err);
    process.exit(1);
  });
