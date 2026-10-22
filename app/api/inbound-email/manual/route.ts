import { NextRequest, NextResponse } from "next/server";
import { handleManualInbound } from "@/lib/email/manual-inbound";

export const maxDuration = 300;

// Ingest a raw RFC822 message through the inbound-email pipeline without it
// being sent anywhere (lib/email/manual-inbound.ts has the contract).
//   POST /api/inbound-email/manual
//   Authorization: Bearer <CRON_SECRET>
//   { "token": "ams-…", "raw": "<base64 RFC822>", "dryRun"?, "suppressPush"?,
//     "redactions"?: [{ "pattern", "flags"?, "replace"? }], "source"?,
//     "sanitize"?, "forbiddenTokens"?: string[], "contentDedupe"?, "ensureFolder"? }
// maxDuration covers waiting for processing and folder sorting (ensureFolder).
export async function POST(request: NextRequest) {
  const { status, body } = await handleManualInbound(request, {
    secret: process.env.CRON_SECRET,
    origin: process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin,
  });
  return NextResponse.json(body, { status });
}
