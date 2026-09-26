/**
 * Chat accuracy eval. Runs each golden question through the production chat
 * pipeline (lib/ai/chat-turn.ts → the same model and prompt parents get), then
 * scores the answer two ways:
 *
 *   - deterministic: retrieval surfaced the right documents, every [N] resolves
 *     to a real source, each cited clause's specifics (times, numbers, emails)
 *     appear in the passage it cites, follow-ups are well formed, required
 *     facts present
 *   - judged: a stronger model compares the answer against the ground truth in
 *     scripts/eval/cases.ts and against the context the assistant was given,
 *     listing any claim the context doesn't support
 *
 * Usage:
 *   npx tsx scripts/eval-chat.ts                 # all cases, 1 run each
 *   npx tsx scripts/eval-chat.ts --runs 3        # repeat to see variance
 *   npx tsx scripts/eval-chat.ts --only eid,sick-who-to-call
 *   npx tsx scripts/eval-chat.ts --label baseline
 *   EVAL_JUDGE_MODEL=gemini-3.8-flash npx tsx scripts/eval-chat.ts \
 *     --rejudge eval-results/baseline-….json   # re-grade saved answers
 *
 * Results are written to eval-results/<label>-<timestamp>.json.
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local"), quiet: true });

import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { parseArgs } from "util";
import { generateObject, generateText, type UIMessage } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { CHAT_MODEL_ID, prepareChatTurn } from "@/lib/ai/chat-turn";
import { parseFollowUps } from "@/lib/chat-utils";
import { findCitationMismatches, type CitationMismatch } from "@/lib/ai/citation-check";
import { CASES, type EvalCase } from "./eval/cases";

// Pinned so calendar answers ("has it passed yet?") are reproducible.
const EVAL_NOW = new Date("2026-09-23T16:00:00Z");
const DEFAULT_SCHOOL_SLUG = "demo";
// A stronger model than the one under test. (gemini-2.5-pro is closed to new
// API keys.)
const JUDGE_MODEL_ID = process.env.EVAL_JUDGE_MODEL || "gemini-3.1-pro-preview";
// Set to trial a different answer model on the same questions before
// switching production (lib/ai/chat-turn.ts) over to it.
const ANSWER_MODEL_ID = process.env.EVAL_ANSWER_MODEL || CHAT_MODEL_ID;
const CONCURRENCY = 4;

const { values: args } = parseArgs({
  options: {
    school: { type: "string", default: DEFAULT_SCHOOL_SLUG },
    runs: { type: "string", default: "1" },
    only: { type: "string" },
    label: { type: "string", default: "run" },
    rejudge: { type: "string" },
  },
});

const judgeSchema = z.object({
  correct: z
    .boolean()
    .describe("The answer conveys the expected answer's key facts and gives no wrong ones."),
  grounded: z
    .boolean()
    .describe("Every factual claim in the answer is supported by the context."),
  unsupported_claims: z
    .array(z.string())
    .describe("Claims in the answer that the context does not support. Empty if none."),
  notes: z.string().describe("One or two sentences explaining the verdict."),
});
type Judgement = z.infer<typeof judgeSchema>;

interface CaseResult {
  id: string;
  run: number;
  question: string;
  searchQuery: string;
  answer: string;
  sourceTitles: string[];
  checks: {
    retrieval: boolean;
    citationsValid: boolean;
    /** Every cited clause's specifics appear in the passage it cites. */
    citationsPrecise?: boolean;
    followUps: boolean;
    mustMatch: boolean;
    mustNotMatch: boolean;
  };
  citationMismatches?: CitationMismatch[];
  judge: Judgement | null;
  pass: boolean;
  error?: string;
}

function toUIMessages(c: EvalCase): UIMessage[] {
  const turns = [...(c.history ?? []), { role: "user" as const, text: c.question }];
  return turns.map((t, i) => ({
    id: `eval-${c.id}-${i}`,
    role: t.role,
    parts: [{ type: "text", text: t.text }],
  }));
}

function citedNumbers(answer: string): number[] {
  return [...answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
}

async function judge(
  c: EvalCase,
  systemPrompt: string,
  answer: string
): Promise<Judgement> {
  const conversation = [...(c.history ?? []), { role: "user", text: c.question }]
    .map((t) => `${t.role.toUpperCase()}: ${t.text}`)
    .join("\n");

  const { object } = await generateObject({
    model: google(JUDGE_MODEL_ID),
    schema: judgeSchema,
    temperature: 0,
    system:
      "You grade a school assistant's answers to parents. Be strict about facts and lenient about wording, tone, and length. Follow-up question suggestions at the end of an answer are not claims; ignore them.",
    prompt: `<assistant_context>
${systemPrompt}
</assistant_context>

<conversation>
${conversation}
</conversation>

<answer>
${answer}
</answer>

<expected_answer>
${c.expected}
</expected_answer>

Grade the answer.
- correct: does it convey the expected answer's key facts, handle any caveat the expected answer calls for, and avoid stating anything wrong? Extra relevant detail that is true is fine.
- grounded: is every factual claim (names, numbers, dates, times, emails, policies) supported by assistant_context? General courtesy and advice like "contact the school office" is not a factual claim.
- unsupported_claims: quote each claim that assistant_context does not support.`,
  });
  return object;
}

async function runCase(c: EvalCase, run: number, schoolId: string): Promise<CaseResult> {
  const base = { id: c.id, run, question: c.question };
  try {
    const turn = await prepareChatTurn({
      messages: toUIMessages(c),
      lastMessageText: c.question,
      schoolId,
      children: c.children ?? [],
      now: EVAL_NOW,
    });

    const { text } = await generateText({
      model: google(ANSWER_MODEL_ID),
      system: turn.systemPrompt,
      messages: turn.modelMessages,
      temperature: turn.temperature,
      maxRetries: 5,
    });

    const { content: answer, followUps } = parseFollowUps(text);
    const sourceTitles = turn.sources.map((s) => s.title);
    const cited = citedNumbers(answer);
    const citationMismatches = findCitationMismatches(
      answer,
      turn.sources.map((s) => s.chunk_content)
    );

    const checks = {
      retrieval: (c.expectDocs ?? []).every((d) =>
        sourceTitles.some((t) => t.toLowerCase().includes(d.toLowerCase()))
      ),
      citationsValid: cited.every((n) => n >= 1 && n <= turn.sources.length),
      citationsPrecise: citationMismatches.length === 0,
      followUps: followUps.length === 3,
      mustMatch: (c.mustMatch ?? []).every((re) => re.test(answer)),
      mustNotMatch: !(c.mustNotMatch ?? []).some((re) => re.test(answer)),
    };

    // A judge failure is reported, but must not discard the answer and the
    // deterministic checks already computed for it.
    let verdict: Judgement | null = null;
    let judgeError: string | undefined;
    try {
      verdict = await judge(c, turn.systemPrompt, answer);
    } catch (err) {
      judgeError = `judge failed: ${err instanceof Error ? err.message : String(err)}`;
    }
    const pass =
      Object.values(checks).every(Boolean) && !!verdict?.correct && !!verdict?.grounded;

    return {
      ...base,
      searchQuery: turn.searchQuery,
      answer,
      sourceTitles,
      checks,
      citationMismatches,
      judge: verdict,
      pass,
      error: judgeError,
    };
  } catch (error) {
    return {
      ...base,
      searchQuery: "",
      answer: "",
      sourceTitles: [],
      checks: {
        retrieval: false,
        citationsValid: false,
        followUps: false,
        mustMatch: false,
        mustNotMatch: false,
      },
      judge: null,
      pass: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Run tasks with at most `limit` in flight, preserving input order. */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function rate(results: CaseResult[], pick: (r: CaseResult) => boolean): string {
  const n = results.filter(pick).length;
  return `${n}/${results.length} (${Math.round((100 * n) / results.length)}%)`;
}

function report(results: CaseResult[], runs: number) {
  for (const r of results) {
    const failed = Object.entries(r.checks)
      .filter(([, ok]) => !ok)
      .map(([k]) => k);
    if (r.judge && !r.judge.correct) failed.push("judge:incorrect");
    if (r.judge && !r.judge.grounded) failed.push("judge:ungrounded");
    const tag = r.pass ? "PASS" : r.judge || failed.length > 0 ? "FAIL" : "????";
    console.log(`${tag}  ${r.id}${runs > 1 ? ` #${r.run + 1}` : ""}${failed.length ? `  [${failed.join(", ")}]` : ""}`);
    if (r.error) console.log(`      error: ${r.error}`);
    for (const m of r.citationMismatches ?? []) {
      console.log(`      citation: "${m.token}" not in [${m.cited.join("][")}] — "${m.clause.slice(0, 90)}"`);
    }
    if (!r.pass && r.judge) {
      console.log(`      judge: ${r.judge.notes}`);
      for (const claim of r.judge.unsupported_claims) console.log(`      unsupported: ${claim}`);
    }
  }

  // An answer the judge never saw (quota, outage) is unknown, not failed.
  const judged = results.filter((r) => r.judge);
  const unjudged = results.length - judged.length;
  console.log(`
Overall pass     ${rate(judged, (r) => r.pass)}${unjudged ? `   (${unjudged} unjudged — see errors above; ????)` : ""}
Correct (judge)  ${rate(judged, (r) => !!r.judge?.correct)}
Grounded (judge) ${rate(judged, (r) => !!r.judge?.grounded)}
Retrieval        ${rate(results, (r) => r.checks.retrieval)}
Citations valid  ${rate(results, (r) => r.checks.citationsValid)}
Citations precise ${rate(results, (r) => r.checks.citationsPrecise !== false)}
Follow-ups       ${rate(results, (r) => r.checks.followUps)}
Required facts   ${rate(results, (r) => r.checks.mustMatch && r.checks.mustNotMatch)}`);
}

function save(label: string, answerModel: string, results: CaseResult[]) {
  mkdirSync("eval-results", { recursive: true });
  const file = `eval-results/${label}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(file, JSON.stringify({ model: answerModel, judge: JUDGE_MODEL_ID, results }, null, 2));
  console.log(`\nFull results: ${file}`);
}

/**
 * Re-grade answers saved by an earlier run with the current judge and the
 * current case definitions, without regenerating them. Lets runs graded by
 * different judges (e.g. after a quota outage) be compared on one scale.
 */
async function rejudge(file: string, schoolId: string) {
  const saved = JSON.parse(readFileSync(file, "utf8")) as {
    model: string;
    results: CaseResult[];
  };
  const prompts = new Map<string, Promise<string>>();
  const promptFor = (c: EvalCase) => {
    if (!prompts.has(c.id)) {
      prompts.set(
        c.id,
        prepareChatTurn({
          messages: toUIMessages(c),
          lastMessageText: c.question,
          schoolId,
          children: c.children ?? [],
          now: EVAL_NOW,
        }).then((t) => t.systemPrompt)
      );
    }
    return prompts.get(c.id)!;
  };

  const results = await mapPool(saved.results, CONCURRENCY, async (r): Promise<CaseResult> => {
    const c = CASES.find((x) => x.id === r.id);
    if (!c || !r.answer) return { ...r, judge: null, pass: false, error: r.error ?? "no answer / unknown case" };
    const checks = {
      ...r.checks,
      mustMatch: (c.mustMatch ?? []).every((re) => re.test(r.answer)),
      mustNotMatch: !(c.mustNotMatch ?? []).some((re) => re.test(r.answer)),
    };
    try {
      const verdict = await judge(c, await promptFor(c), r.answer);
      const pass = Object.values(checks).every(Boolean) && verdict.correct && verdict.grounded;
      return { ...r, checks, judge: verdict, pass, error: undefined };
    } catch (err) {
      const error = `judge failed: ${err instanceof Error ? err.message : String(err)}`;
      return { ...r, checks, judge: null, pass: false, error };
    }
  });

  const runs = new Set(results.map((r) => r.run)).size;
  console.log(`Re-judged ${file} (answer model ${saved.model}) with ${JUDGE_MODEL_ID}\n`);
  report(results, runs);
  save(args.label, saved.model, results);
}

async function main() {
  const supabase = createAdminClient();
  const { data: school, error } = await supabase
    .from("schools")
    .select("id, name")
    .eq("slug", args.school)
    .single();
  if (error || !school) throw new Error(`School "${args.school}" not found: ${error?.message}`);

  if (args.rejudge) return rejudge(args.rejudge, school.id);

  const only = args.only?.split(",").map((s) => s.trim());
  const cases = only ? CASES.filter((c) => only.includes(c.id)) : CASES;
  if (cases.length === 0) throw new Error(`No cases match --only ${args.only}`);
  const runs = Math.max(1, Number(args.runs) || 1);

  console.log(
    `Evaluating ${cases.length} cases × ${runs} run(s) on "${school.name}" — answer model ${ANSWER_MODEL_ID}, judge ${JUDGE_MODEL_ID}\n`
  );

  const jobs = Array.from({ length: runs }, (_, run) => cases.map((c) => ({ c, run }))).flat();
  const results = await mapPool(jobs, CONCURRENCY, ({ c, run }) => runCase(c, run, school.id));
  report(results, runs);
  save(args.label, ANSWER_MODEL_ID, results);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
