import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/blackbaud/cron-auth";
import { runDocumentPushes } from "@/lib/push/document-push-runner";

export const maxDuration = 60;

// Tell parents about new uploaded / emailed documents, one push per school
// per batch (lib/push/document-push.ts has the timing rules).
//   GET /api/cron/send-document-pushes
//   Authorization: Bearer <CRON_SECRET>   (or ?key=<CRON_SECRET>)
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  if (!isCronAuthorized(request, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { schools, error } = await runDocumentPushes();
  if (error) return NextResponse.json({ error }, { status: 500 });

  return NextResponse.json({
    schools: schools.length,
    sent: schools.filter((s) => s.result === "sent").length,
    results: schools,
  });
}
