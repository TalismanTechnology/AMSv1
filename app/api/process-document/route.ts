import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";

export const maxDuration = 300;

const PROCESS_SECRET = process.env.PROCESS_DOCUMENT_SECRET;

export async function POST(request: NextRequest) {
  if (PROCESS_SECRET) {
    const authHeader = request.headers.get("x-process-secret");
    if (authHeader !== PROCESS_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const { documentId } = await request.json();

    if (!documentId) {
      return NextResponse.json(
        { error: "documentId is required" },
        { status: 400 }
      );
    }

    const isDev = process.env.NODE_ENV === "development";

    if (isDev) {
      // In dev, spawn a separate process to avoid OOM in the Turbopack dev server
      const workerScript = path.join(process.cwd(), "scripts", "process-worker.ts");
      const tsxBin = path.join(process.cwd(), "node_modules", ".bin", "tsx");

      // Set explicit heap for the child process (separate from dev server)
      const childEnv = { ...process.env };
      childEnv.NODE_OPTIONS = "--max-old-space-size=4096";

      // Log file for child process output
      const logFile = path.join(process.cwd(), "process-worker.log");
      const logFd = fs.openSync(logFile, "a");

      const child = spawn(
        tsxBin,
        [workerScript, documentId],
        {
          cwd: process.cwd(),
          env: childEnv,
          stdio: ["ignore", logFd, logFd],
          detached: true,
        }
      );

      child.on("error", (err) => {
        console.error(`[process-document] Child spawn error:`, err);
        fs.closeSync(logFd);
      });

      child.on("exit", (code) => {
        console.log(`[process-document] Child exited with code ${code}`);
        fs.closeSync(logFd);
      });

      child.unref();

      console.log(`[process-document] Spawned worker for ${documentId} (pid: ${child.pid}), log: ${logFile}`);
      return NextResponse.json({ status: "processing", documentId });
    } else {
      // In production (Vercel), run inline — separate serverless function has its own memory
      const { processDocument } = await import("@/lib/documents/processor");
      const result = await processDocument(documentId);
      return NextResponse.json(result);
    }
  } catch (error) {
    console.error("[process-document] Failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Processing failed",
      },
      { status: 500 }
    );
  }
}
