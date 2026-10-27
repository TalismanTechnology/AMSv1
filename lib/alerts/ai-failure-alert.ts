import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmailWithResult, type SendEmailResult } from "@/lib/email/resend";
import { escapeHtml } from "@/lib/roster/login-email";
import { isNotInstalledError } from "@/lib/supabase/not-installed";
import {
  adminAiErrorMessage,
  classifyAiError,
  isAiProviderError,
  rawAiErrorMessage,
  type AiErrorCategory,
} from "@/lib/ai/provider-errors";

// Owner alert when the AI provider fails: an email to OPS_ALERT_EMAIL with the
// category and the provider's raw message, at most once per category per
// hour. Never on the parent's path: the send is scheduled with after() and
// every failure in it is swallowed.
//
// Throttle: the claim_ops_alert() function from migration 048 makes "once
// per hour" hold across serverless instances. Until that migration is
// applied (or if the database can't be reached) each instance keeps its own
// in-memory throttle instead.

export const AI_ALERT_WINDOW_MS = 60 * 60 * 1000;
/** After the database says "already sent", ask it again this soon. */
const RECHECK_AFTER_MS = 5 * 60 * 1000;
/** An alert that hangs (DB, Resend) gives up rather than holding after(). */
const ALERT_TIMEOUT_MS = 10_000;
const DEFAULT_OPS_EMAIL = "lucashaines2010@gmail.com";

export interface AiFailureContext {
  /** Which code path failed, e.g. "chat.stream". */
  source: string;
  schoolId?: string | null;
  /** Known already (saves a lookup); otherwise read by schoolId. */
  school?: { name?: string | null; slug?: string | null } | null;
}

export interface AlertDeps {
  /** true/false = the database decided; null = unavailable, use memory. */
  claimInDb?: (key: string, windowMs: number) => Promise<boolean | null>;
  sendEmail?: (message: {
    to: string;
    subject: string;
    html: string;
    text: string;
    from: string;
  }) => Promise<SendEmailResult>;
  lookupSchool?: (schoolId: string) => Promise<{ name: string | null; slug: string | null } | null>;
  /** Runs the alert task without the caller waiting for it. */
  schedule?: (task: () => Promise<void>) => void;
  now?: () => number;
}

// ── Throttle ──────────────────────────────────────────

const memory = new Map<string, number>();

/** Test hook: forget the in-memory throttle. */
export function resetAlertThrottleMemory(): void {
  memory.clear();
}

async function claimInSupabase(key: string, windowMs: number): Promise<boolean | null> {
  try {
    const { data, error } = await createAdminClient().rpc("claim_ops_alert", {
      p_key: key,
      p_window_seconds: Math.round(windowMs / 1000),
    });
    if (error) {
      if (!isNotInstalledError(error)) {
        console.error("[ai-alert] Throttle claim failed (using memory):", error.message);
      }
      return null;
    }
    return data === true;
  } catch (err) {
    console.error("[ai-alert] Throttle claim failed (using memory):", err);
    return null;
  }
}

/**
 * Whether this instance may send the alert for `key` now. The in-memory
 * record is checked first, so a burst of failures costs one database call.
 */
export async function claimAlertSlot(
  key: string,
  deps: Pick<AlertDeps, "claimInDb" | "now"> = {},
  windowMs: number = AI_ALERT_WINDOW_MS
): Promise<boolean> {
  const now = deps.now ?? Date.now;
  const last = memory.get(key);
  if (last !== undefined && now() - last < windowMs) return false;

  const claimInDb = deps.claimInDb ?? claimInSupabase;
  let decided: boolean | null;
  try {
    decided = await claimInDb(key, windowMs);
  } catch {
    decided = null;
  }

  if (decided === false) {
    // Another instance sent it; look again in a few minutes.
    memory.set(key, now() - windowMs + RECHECK_AFTER_MS);
    return false;
  }
  // Claimed in the database, or deciding alone (no table yet).
  memory.set(key, now());
  return true;
}

// ── Email ─────────────────────────────────────────────

export function opsAlertEmail(): string {
  return process.env.OPS_ALERT_EMAIL?.trim() || DEFAULT_OPS_EMAIL;
}

/** Same verified askmyschool.app sender as the sign-in code emails. */
export function opsAlertFromAddress(): string {
  return (
    process.env.AUTH_EMAIL_FROM ||
    process.env.EMAIL_FROM ||
    "AskMySchool <noreply@askmyschool.app>"
  );
}

export function buildAiFailureAlertEmail(input: {
  category: AiErrorCategory;
  source: string;
  rawMessage: string;
  school: { id?: string | null; name?: string | null; slug?: string | null } | null;
  at: Date;
}): { subject: string; html: string; text: string } {
  const schoolLine = input.school
    ? [input.school.name, input.school.slug && `(${input.school.slug})`, input.school.id && `id ${input.school.id}`]
        .filter(Boolean)
        .join(" ")
    : "n/a";
  const rows: [string, string][] = [
    ["Category", input.category],
    ["Source", input.source],
    ["School", schoolLine || "n/a"],
    ["Time", input.at.toISOString()],
    ["Provider message", input.rawMessage],
  ];
  const subject = `[AskMySchool] AI provider failure: ${input.category}`;
  const text = [
    "The AI provider failed. Parents were shown a generic \"temporarily unavailable\" message.",
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    "Further alerts for this category are suppressed for an hour.",
  ].join("\n");
  const html = `<p>The AI provider failed. Parents were shown a generic &ldquo;temporarily unavailable&rdquo; message.</p>
<table cellpadding="4" style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
${rows
  .map(
    ([k, v]) =>
      `<tr><td style="vertical-align:top;font-weight:bold;white-space:nowrap">${escapeHtml(k)}</td><td style="white-space:pre-wrap">${escapeHtml(v)}</td></tr>`
  )
  .join("\n")}
</table>
<p style="color:#666;font-size:12px">Further alerts for this category are suppressed for an hour.</p>`;
  return { subject, html, text };
}

async function lookupSchoolInSupabase(schoolId: string) {
  const { data } = await createAdminClient()
    .from("schools")
    .select("name, slug")
    .eq("id", schoolId)
    .maybeSingle();
  return data ? { name: data.name ?? null, slug: data.slug ?? null } : null;
}

/** Throttle, then email. Resolves (never rejects) once done or given up. */
export async function sendAiFailureAlert(
  input: { category: AiErrorCategory; rawMessage: string; context: AiFailureContext; at: Date },
  deps: AlertDeps = {}
): Promise<void> {
  try {
    const claimed = await claimAlertSlot(`ai_failure:${input.category}`, deps);
    if (!claimed) return;

    const { context } = input;
    let school = context.school ?? null;
    if (!school && context.schoolId) {
      try {
        school = await (deps.lookupSchool ?? lookupSchoolInSupabase)(context.schoolId);
      } catch {
        school = null;
      }
    }

    const email = buildAiFailureAlertEmail({
      category: input.category,
      source: context.source,
      rawMessage: input.rawMessage,
      school: context.schoolId || school ? { id: context.schoolId, ...school } : null,
      at: input.at,
    });
    const send = deps.sendEmail ?? sendEmailWithResult;
    const result = await send({ to: opsAlertEmail(), from: opsAlertFromAddress(), ...email });
    if (!result.ok) console.error("[ai-alert] Alert email not sent:", result.error);
  } catch (err) {
    console.error("[ai-alert] Alert failed:", err);
  }
}

function withTimeout(task: Promise<void>, ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
    task.finally(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/** after() inside a request; outside one (scripts, tests) just runs it. */
function scheduleAfterResponse(task: () => Promise<void>): void {
  try {
    after(task);
  } catch {
    void task();
  }
}

/**
 * Log an AI failure and, if it is the provider's fault, alert the owner in
 * the background. Returns at once with the category (for picking a message)
 * and a promise that settles when the alert is done — callers may ignore it;
 * it never rejects. Never throws.
 */
export function reportAiFailure(
  error: unknown,
  context: AiFailureContext,
  deps: AlertDeps = {}
): { category: AiErrorCategory; alerted: Promise<void> } {
  try {
    const category = classifyAiError(error);
    const rawMessage = rawAiErrorMessage(error);
    console.error(`[ai-failure] ${context.source} (${category}): ${rawMessage}`);
    if (!isAiProviderError(error)) return { category, alerted: Promise.resolve() };
    // Under node --test, never reach the real database or Resend: a test
    // that exercises a failing AI path elsewhere must not email anyone.
    if (process.env.NODE_TEST_CONTEXT && !(deps.sendEmail && deps.claimInDb)) {
      return { category, alerted: Promise.resolve() };
    }

    const at = new Date((deps.now ?? Date.now)());
    let settle!: () => void;
    const alerted = new Promise<void>((resolve) => (settle = resolve));
    const task = () =>
      withTimeout(sendAiFailureAlert({ category, rawMessage, context, at }, deps), ALERT_TIMEOUT_MS).finally(
        settle
      );
    (deps.schedule ?? scheduleAfterResponse)(task);
    return { category, alerted };
  } catch {
    return { category: "unknown", alerted: Promise.resolve() };
  }
}

/**
 * What an admin surface may show for a failure: the AI category message when
 * the provider failed (which is also reported and alerted on), otherwise the
 * error's own message — those are ours, not the provider's.
 */
export function adminSafeErrorMessage(
  error: unknown,
  context: AiFailureContext,
  fallback = "Something went wrong. Try again.",
  deps: AlertDeps = {}
): string {
  if (isAiProviderError(error)) {
    return adminAiErrorMessage(reportAiFailure(error, context, deps).category);
  }
  const message = error instanceof Error ? error.message : "";
  return message || fallback;
}
