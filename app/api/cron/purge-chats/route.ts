import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCronAuthorized } from "@/lib/blackbaud/cron-auth";
import { purgeExpiredChats } from "@/lib/chat/retention";
import { scrubExpiredQuestionEvents } from "@/lib/insights/purge-questions";
import { questionScrubCutoff } from "@/lib/insights/scrub";

export const maxDuration = 300;

// Stop starting topic labeling for more schools after this long, leaving
// time to scrub what is already eligible.
const LABEL_BUDGET_MS = 200_000;

function errorMessage(err: unknown): string {
  const message = (err as { message?: unknown } | null)?.message;
  return typeof message === "string" ? message : String(err);
}

// Chat retention and question-analytics scrub. Every 30 minutes:
//   GET /api/cron/purge-chats
//   Authorization: Bearer <CRON_SECRET>   (or ?key=<CRON_SECRET>)
//
// 1. Chats (lib/chat/retention.ts): delete UNFLAGGED chats idle (no activity)
//    for 30 days. FLAGGED chats (unanswered, or the owner's thumbs-down) keep
//    everything; once idle for 30 days they are hidden from the parent.
// 2. Question analytics (lib/insights/scrub.ts): label question events older
//    than 30 minutes with a topic, then strip their text and parent id (kept:
//    flags, counts and a keyed asker hash). Unlabeled events are scrubbed
//    anyway after 24 hours. This is what keeps the schedule at 30 minutes.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  if (!isCronAuthorized(request, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const now = new Date();
  const supabase = createAdminClient();
  const errors: string[] = [];

  let chats = null;
  try {
    chats = await purgeExpiredChats(supabase, { now });
  } catch (err) {
    console.error("[purge-chats] chat purge failed:", err);
    errors.push(`chats: ${errorMessage(err)}`);
  }

  let questions = null;
  try {
    questions = await scrubExpiredQuestionEvents(supabase, {
      cutoff: questionScrubCutoff(now),
      now,
      labelDeadline: startedAt + LABEL_BUDGET_MS,
    });
  } catch (err) {
    console.error("[purge-chats] question scrub failed:", err);
    errors.push(`questions: ${errorMessage(err)}`);
  }

  return NextResponse.json(
    { chats, questions, errors },
    { status: errors.length > 0 ? 500 : 200 }
  );
}
