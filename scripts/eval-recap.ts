/**
 * Recap regression eval. Asks a 3-question chat against the live answer
 * model through the production pipeline — history built from "stored" turns
 * by buildModelHistory exactly as app/api/chat/route.ts does, then
 * prepareChatTurn and the same model, system prompt and messages — and checks
 * that the 3rd answer answers only the 3rd question, not finals or dress-down
 * days again.
 *
 * Not part of npm test: it calls Gemini and reads the school's documents.
 *
 * Usage:
 *   npx tsx scripts/eval-recap.ts                    # 1 run on "collegiate"
 *   npx tsx scripts/eval-recap.ts --runs 3 --school collegiate
 *
 * Needs GOOGLE_GENERATIVE_AI_API_KEY and the Supabase env (.env.local); exits
 * 0 without running when the API key is missing, 1 if any run recaps.
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local"), quiet: true });

import { parseArgs } from "util";
import { generateText, type UIMessage } from "ai";
import { google } from "@ai-sdk/google";
import { createAdminClient } from "@/lib/supabase/admin";
import { CHAT_MODEL_ID, prepareChatTurn } from "@/lib/ai/chat-turn";
import { parseFollowUps } from "@/lib/chat-utils";
import { buildModelHistory, type StoredMessage } from "@/lib/chat/retention";

const QUESTIONS = [
  "when are finals",
  "what are the dress down days?",
  "what is the current ranking for 8th grade collegiate soccer?",
];
// Anything about the first two topics in the 3rd answer is a recap.
const EARLIER_TOPICS = /\b(finals?|exams?|dress[- ]?(down|code))\b/i;

const { values: args } = parseArgs({
  options: {
    school: { type: "string", default: "collegiate" },
    runs: { type: "string", default: "1" },
  },
});

async function runChat(schoolId: string): Promise<string[]> {
  // What the route would have stored: each question, then its cleaned answer.
  const stored: StoredMessage[] = [];
  const answers: string[] = [];
  let clock = Date.now();
  const store = (role: "user" | "assistant", content: string) =>
    stored.push({
      id: `${role}-${stored.length}`,
      role,
      content,
      created_at: new Date(clock++).toISOString(),
    });

  for (const [i, question] of QUESTIONS.entries()) {
    const latest: UIMessage = {
      id: `client-${i}`,
      role: "user",
      parts: [{ type: "text", text: question }],
    };
    const turn = await prepareChatTurn({
      messages: buildModelHistory(stored, latest) as UIMessage[],
      lastMessageText: question,
      schoolId,
      children: [],
    });
    const { text } = await generateText({
      model: google(CHAT_MODEL_ID),
      system: turn.systemPrompt,
      messages: turn.modelMessages,
      temperature: turn.temperature,
      maxRetries: 5,
    });
    const answer = parseFollowUps(text).content;
    answers.push(answer);
    console.log(`\nQ${i + 1}: ${question}\n  search: ${turn.searchQuery}\n  A: ${answer.replace(/\s+/g, " ").slice(0, 400)}`);
    store("user", question);
    store("assistant", answer);
  }
  return answers;
}

async function main() {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    console.log("GOOGLE_GENERATIVE_AI_API_KEY is not set — skipping the recap eval.");
    return;
  }
  const { data: school, error } = await createAdminClient()
    .from("schools")
    .select("id, name")
    .eq("slug", args.school)
    .single();
  if (error || !school) throw new Error(`School "${args.school}" not found: ${error?.message}`);

  const runs = Math.max(1, Number(args.runs) || 1);
  console.log(`Recap eval on "${school.name}" — model ${CHAT_MODEL_ID}, ${runs} run(s)`);

  let failures = 0;
  for (let run = 1; run <= runs; run++) {
    console.log(`\n=== Run ${run} ===`);
    const third = (await runChat(school.id))[2];
    const recap = third.match(EARLIER_TOPICS);
    if (recap) {
      failures++;
      console.log(`\nFAIL: the 3rd answer mentions "${recap[0]}" from an earlier question.`);
    } else {
      console.log("\nPASS: the 3rd answer sticks to the 3rd question.");
    }
  }
  console.log(`\n${runs - failures}/${runs} runs passed.`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
