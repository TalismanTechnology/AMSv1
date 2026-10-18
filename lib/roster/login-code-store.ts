import { createAdminClient } from "@/lib/supabase/admin";
import { isNotInstalledError } from "@/lib/supabase/not-installed";
import { CODE_TTL_MS, MINUTE_MS, type StoredCode } from "./login-code";

// parent_login_codes I/O (migration 045). The rules live in login-code.ts.
// Rows double as the rate-limit ledger, so limits hold across serverless
// instances without any other store.

const TABLE = "parent_login_codes";

export class LoginCodesNotInstalledError extends Error {
  constructor() {
    super("parent_login_codes is not installed (migration 045)");
  }
}

function fail(step: string, error: { code?: string; message: string }): never {
  if (isNotInstalledError(error)) throw new LoginCodesNotInstalledError();
  throw new Error(`Could not ${step}: ${error.message}`);
}

function since(now: Date, minutes: number): string {
  return new Date(now.getTime() - minutes * MINUTE_MS).toISOString();
}

/** Code requests recorded for these email keys and this IP, per window. */
export async function countCodeRequests(input: {
  schoolId: string;
  emailKeys: string[];
  ipHash: string;
  now: Date;
}): Promise<{ emailLast15Minutes: number; emailLast24Hours: number; ipLastHour: number }> {
  const admin = createAdminClient();
  const forEmail = (minutes: number) =>
    admin
      .from(TABLE)
      .select("id", { count: "exact", head: true })
      .eq("school_id", input.schoolId)
      .in("email", input.emailKeys)
      .gte("created_at", since(input.now, minutes));

  const [last15, last24h, ipHour] = await Promise.all([
    forEmail(15),
    forEmail(24 * 60),
    admin
      .from(TABLE)
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", input.ipHash)
      .gte("created_at", since(input.now, 60)),
  ]);

  const error = last15.error ?? last24h.error ?? ipHour.error;
  if (error) fail("count sign-in code requests", error);

  return {
    emailLast15Minutes: last15.count ?? 0,
    emailLast24Hours: last24h.count ?? 0,
    ipLastHour: ipHour.count ?? 0,
  };
}

/**
 * Stores a new code, first retiring any earlier unconsumed code for the same
 * school + email so only the newest one works.
 */
export async function storeLoginCode(input: {
  schoolId: string;
  email: string;
  codeHash: string;
  ipHash: string;
  now: Date;
}): Promise<void> {
  const admin = createAdminClient();
  const nowIso = input.now.toISOString();

  const { error: retireError } = await admin
    .from(TABLE)
    .update({ consumed_at: nowIso })
    .eq("school_id", input.schoolId)
    .eq("email", input.email)
    .is("consumed_at", null);
  if (retireError) fail("retire earlier sign-in codes", retireError);

  const { error } = await admin.from(TABLE).insert({
    school_id: input.schoolId,
    email: input.email,
    code_hash: input.codeHash,
    expires_at: new Date(input.now.getTime() + CODE_TTL_MS).toISOString(),
    ip_hash: input.ipHash,
    created_at: nowIso,
  });
  if (error) fail("store sign-in code", error);
}

/**
 * Records a request for an address that isn't on the roster: a row that can
 * never be redeemed (already consumed, random hash), so the request still
 * counts toward the limits.
 */
export async function recordUnlistedRequest(input: {
  schoolId: string;
  emailKey: string;
  codeHash: string;
  ipHash: string;
  now: Date;
}): Promise<void> {
  const nowIso = input.now.toISOString();
  const { error } = await createAdminClient().from(TABLE).insert({
    school_id: input.schoolId,
    email: input.emailKey,
    code_hash: input.codeHash,
    expires_at: nowIso,
    consumed_at: nowIso,
    ip_hash: input.ipHash,
    created_at: nowIso,
  });
  if (error) fail("record sign-in code request", error);
}

export interface CodeRow extends StoredCode {
  id: string;
  code_hash: string;
}

/** The newest unconsumed code for this school + email (expired or not). */
export async function loadNewestCode(schoolId: string, email: string): Promise<CodeRow | null> {
  const { data, error } = await createAdminClient()
    .from(TABLE)
    .select("id, code_hash, expires_at, attempts, consumed_at")
    .eq("school_id", schoolId)
    .eq("email", email)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) fail("load sign-in code", error);
  return (data as CodeRow | null) ?? null;
}

/**
 * Failed tries recorded on code requests from the last 15 minutes, for both
 * the address and its unlisted stand-in (login-code.ts unlistedEmailKey), so
 * the limit behaves the same whether or not the address is on the roster.
 */
export async function countRecentFailedAttempts(input: {
  schoolId: string;
  emailKeys: string[];
  now: Date;
}): Promise<number> {
  const { data, error } = await createAdminClient()
    .from(TABLE)
    .select("attempts")
    .eq("school_id", input.schoolId)
    .in("email", input.emailKeys)
    .gte("created_at", since(input.now, 15));
  if (error) fail("count sign-in attempts", error);
  return (data ?? []).reduce((sum, row) => sum + ((row.attempts as number) ?? 0), 0);
}

/**
 * Counts a failed try against the newest request from the last 15 minutes
 * (the live code, when there is one). Nothing recent → nothing to guess.
 */
export async function recordFailedAttempt(input: {
  schoolId: string;
  emailKeys: string[];
  now: Date;
}): Promise<void> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from(TABLE)
    .select("id, attempts")
    .eq("school_id", input.schoolId)
    .in("email", input.emailKeys)
    .gte("created_at", since(input.now, 15))
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) fail("load sign-in attempts", error);
  if (!data) return;

  // Compare-and-set on the count we read; a lost race just under-counts one.
  const { error: updateError } = await admin
    .from(TABLE)
    .update({ attempts: (data.attempts as number) + 1 })
    .eq("id", data.id)
    .eq("attempts", data.attempts);
  if (updateError) fail("record sign-in attempt", updateError);
}

/** Claims the code exactly once. False if someone else already used it. */
export async function consumeCode(id: string, now: Date): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from(TABLE)
    .update({ consumed_at: now.toISOString() })
    .eq("id", id)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();
  if (error) fail("use sign-in code", error);
  return Boolean(data);
}
