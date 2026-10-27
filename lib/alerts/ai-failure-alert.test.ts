import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { APICallError } from "ai";
import {
  AI_ALERT_WINDOW_MS,
  adminSafeErrorMessage,
  buildAiFailureAlertEmail,
  claimAlertSlot,
  opsAlertEmail,
  reportAiFailure,
  resetAlertThrottleMemory,
  sendAiFailureAlert,
  type AlertDeps,
} from "./ai-failure-alert";
import { adminAiErrorMessage } from "@/lib/ai/provider-errors";

// No real Supabase, Resend or Gemini calls: every dependency is injected.

const CREDITS_DEPLETED = "Your prepayment credits are depleted. Please go to AI Studio.";

function creditsError() {
  return new APICallError({
    message: CREDITS_DEPLETED,
    url: "https://generativelanguage.googleapis.com/x",
    requestBodyValues: {},
    statusCode: 429,
  });
}

type Sent = Parameters<NonNullable<AlertDeps["sendEmail"]>>[0];

function fakes(overrides: Partial<AlertDeps> = {}) {
  const sent: Sent[] = [];
  let clock = Date.parse("2026-10-27T12:00:00Z");
  const deps: AlertDeps = {
    claimInDb: async () => null, // table not installed
    sendEmail: async (message) => {
      sent.push(message);
      return { ok: true };
    },
    lookupSchool: async () => ({ name: "Lakeside School", slug: "lakeside" }),
    now: () => clock,
    ...overrides,
  };
  return { deps, sent, advance: (ms: number) => (clock += ms) };
}

const quiet = console.error;
beforeEach(() => {
  resetAlertThrottleMemory();
  console.error = () => {};
});
test.after(() => {
  console.error = quiet;
});

// ── Throttle ──────────────────────────────────────────

test("memory throttle: one alert per key per hour when the table is missing", async () => {
  const { deps, advance } = fakes();
  assert.equal(await claimAlertSlot("ai_failure:billing_quota", deps), true);
  assert.equal(await claimAlertSlot("ai_failure:billing_quota", deps), false);
  // Another category is throttled separately.
  assert.equal(await claimAlertSlot("ai_failure:rate_limit", deps), true);
  advance(AI_ALERT_WINDOW_MS - 1000);
  assert.equal(await claimAlertSlot("ai_failure:billing_quota", deps), false);
  advance(2000);
  assert.equal(await claimAlertSlot("ai_failure:billing_quota", deps), true);
});

test("a database error or throw falls back to memory", async () => {
  const { deps } = fakes({
    claimInDb: async () => {
      throw new Error("relation \"ops_alert_throttle\" does not exist");
    },
  });
  assert.equal(await claimAlertSlot("k", deps), true);
  assert.equal(await claimAlertSlot("k", deps), false);
});

test("the database decides when available; memory spares repeat calls", async () => {
  const calls: string[] = [];
  let allow = true;
  const { deps, advance } = fakes({
    claimInDb: async (key) => {
      calls.push(key);
      return allow;
    },
  });
  assert.equal(await claimAlertSlot("k", deps), true);
  assert.equal(await claimAlertSlot("k", deps), false);
  assert.equal(calls.length, 1, "second claim answered from memory");

  // Another instance already sent it: the DB says no, and this instance asks
  // again after a few minutes rather than waiting a whole hour.
  resetAlertThrottleMemory();
  allow = false;
  assert.equal(await claimAlertSlot("k", deps), false);
  assert.equal(await claimAlertSlot("k", deps), false);
  assert.equal(calls.length, 2);
  advance(6 * 60 * 1000);
  allow = true;
  assert.equal(await claimAlertSlot("k", deps), true);
  assert.equal(calls.length, 3);
});

// ── Email ─────────────────────────────────────────────

test("OPS_ALERT_EMAIL defaults to the owner", () => {
  const saved = process.env.OPS_ALERT_EMAIL;
  try {
    delete process.env.OPS_ALERT_EMAIL;
    assert.equal(opsAlertEmail(), "lucashaines2010@gmail.com");
    process.env.OPS_ALERT_EMAIL = "ops@example.com";
    assert.equal(opsAlertEmail(), "ops@example.com");
  } finally {
    if (saved === undefined) delete process.env.OPS_ALERT_EMAIL;
    else process.env.OPS_ALERT_EMAIL = saved;
  }
});

test("the alert email has the category, raw message, school and time, escaped", () => {
  const email = buildAiFailureAlertEmail({
    category: "billing_quota",
    source: "chat.stream",
    rawMessage: `${CREDITS_DEPLETED} <script>`,
    school: { id: "s1", name: "Lakeside & Co", slug: "lakeside" },
    at: new Date("2026-10-27T12:00:00Z"),
  });
  assert.match(email.subject, /billing_quota/);
  for (const part of ["billing_quota", "chat.stream", "prepayment credits", "lakeside", "2026-10-27T12:00:00.000Z"]) {
    assert.ok(email.text.includes(part), part);
    assert.ok(email.html.includes(part), part);
  }
  assert.ok(email.html.includes("Lakeside &amp; Co"));
  assert.ok(!email.html.includes("<script>"));
});

test("sendAiFailureAlert sends once per category per hour, with the school looked up", async () => {
  const { deps, sent } = fakes();
  const input = {
    category: "billing_quota" as const,
    rawMessage: CREDITS_DEPLETED,
    context: { source: "chat.stream", schoolId: "school-1" },
    at: new Date("2026-10-27T12:00:00Z"),
  };
  await sendAiFailureAlert(input, deps);
  await sendAiFailureAlert(input, deps);
  assert.equal(sent.length, 1);
  assert.ok(sent[0].text.includes("Lakeside School (lakeside) id school-1"));
  assert.match(sent[0].from, /askmyschool\.app|@/);
});

test("alert failures are swallowed", async () => {
  const { deps } = fakes({
    sendEmail: async () => {
      throw new Error("Resend down");
    },
    lookupSchool: async () => {
      throw new Error("db down");
    },
  });
  await assert.doesNotReject(
    sendAiFailureAlert(
      { category: "auth", rawMessage: "x", context: { source: "t", schoolId: "s" }, at: new Date() },
      deps
    )
  );
});

// ── Not blocking ──────────────────────────────────────

test("reportAiFailure returns at once and only schedules the alert", async () => {
  const scheduled: (() => Promise<void>)[] = [];
  let sendStarted = false;
  const { deps } = fakes({
    schedule: (task) => scheduled.push(task),
    // Would hang forever if anyone awaited it.
    sendEmail: () => {
      sendStarted = true;
      return new Promise(() => {});
    },
  });

  const { category } = reportAiFailure(creditsError(), { source: "chat.stream", schoolId: "s" }, deps);
  assert.equal(category, "billing_quota");
  assert.equal(scheduled.length, 1);
  assert.equal(sendStarted, false, "nothing ran on the caller's path");

  // Running the scheduled task still never blocks forever: it times out.
  void scheduled[0]();
  await new Promise((r) => setImmediate(r));
  assert.equal(sendStarted, true);
});

test("under node --test, the real database and Resend are never used", () => {
  assert.ok(process.env.NODE_TEST_CONTEXT, "running under node --test");
  const scheduled: unknown[] = [];
  reportAiFailure(creditsError(), { source: "t" }, { schedule: (task) => scheduled.push(task) });
  assert.equal(scheduled.length, 0);
});

test("reportAiFailure never throws, even if scheduling does", () => {
  const { deps } = fakes({
    schedule: () => {
      throw new Error("no request scope");
    },
  });
  assert.doesNotThrow(() => reportAiFailure(creditsError(), { source: "t" }, deps));
});

test("non-provider errors are logged but don't alert", () => {
  const scheduled: unknown[] = [];
  const { deps } = fakes({ schedule: (task) => scheduled.push(task) });
  reportAiFailure(new Error("duplicate key value"), { source: "t" }, deps);
  assert.equal(scheduled.length, 0);
});

test("the alerted promise settles once the email is sent", async () => {
  const { deps, sent } = fakes({ schedule: (task) => void task() });
  const { alerted } = reportAiFailure(creditsError(), { source: "chat.stream" }, deps);
  await alerted;
  assert.equal(sent.length, 1);
  assert.ok(sent[0].text.includes(CREDITS_DEPLETED), "raw message goes to the owner only");
});

test("adminSafeErrorMessage hides provider text but keeps our own messages", () => {
  const scheduled: unknown[] = [];
  const { deps } = fakes({ schedule: (task) => scheduled.push(task) });
  const message = adminSafeErrorMessage(creditsError(), { source: "t" }, undefined, deps);
  assert.equal(scheduled.length, 1, "and the owner is alerted");
  assert.equal(message, adminAiErrorMessage("billing_quota"));
  assert.ok(!message.includes("prepayment"));
  assert.equal(adminSafeErrorMessage(new Error("Not authorized"), { source: "t" }, undefined, deps), "Not authorized");
});
