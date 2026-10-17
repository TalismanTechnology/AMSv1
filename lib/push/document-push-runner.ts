import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveSchoolName } from "@/lib/school-display-name";
import { isApnsConfigured } from "./apns";
import { isFcmConfigured } from "./fcm";
import { sendPushToUsers } from "./index";
import {
  buildDocumentPushMessage,
  isQueueable,
  OUTCOMES,
  shouldSend,
  type DocumentPushOutcome,
} from "./document-push";

// Database side of the "new documents" push (migration 042). Documents are
// queued when they first become ready for parents; the send-document-pushes
// cron sends each school's queue as one notification. Queue rows are kept
// after sending: they are what stops a re-processed document being queued again.

type Db = SupabaseClient;

/**
 * Queue a document for the next new-documents push, if it qualifies (ready,
 * uploaded or emailed, created within `maxAgeMs`). A document already queued,
 * sent or not, is left alone. Best-effort: never throws.
 */
export async function enqueueDocumentPush(documentId: string, maxAgeMs: number): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: doc, error } = await admin
      .from("documents")
      .select("id, school_id, source, status, created_at")
      .eq("id", documentId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!doc?.school_id || !isQueueable(doc, new Date(), maxAgeMs)) return;

    const { error: insertError } = await admin
      .from("document_push_queue")
      .upsert(
        { document_id: doc.id, school_id: doc.school_id },
        { onConflict: "document_id", ignoreDuplicates: true }
      );
    if (insertError) throw new Error(insertError.message);
  } catch (caught: unknown) {
    console.error(`[document-push] could not queue ${documentId}`, caught);
  }
}

interface QueueRow {
  document_id: string;
  school_id: string;
  queued_at: string;
}

export interface SchoolResult {
  schoolId: string;
  pending: number;
  /** An outcome, or why the rows were left pending. */
  result: DocumentPushOutcome | "settling" | "rate_limited" | "claimed_elsewhere" | "error";
  documents?: number;
  recipients?: number;
  error?: string;
}

// PostgREST caps a response at 1000 rows and long `in` lists make long URLs.
const PAGE_SIZE = 1000;
const ID_CHUNK = 200;
const MAX_QUEUE_ROWS = 5000;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Sends every school's due batch. Never throws; per-school failures are reported. */
export async function runDocumentPushes(now = new Date()): Promise<{
  schools: SchoolResult[];
  error?: string;
}> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("document_push_queue")
      .select("document_id, school_id, queued_at")
      .is("processed_at", null)
      .order("queued_at", { ascending: true })
      .limit(MAX_QUEUE_ROWS);

    if (error) {
      console.error("[document-push] could not read the queue", error);
      return { schools: [], error: error.message };
    }

    const bySchool = new Map<string, QueueRow[]>();
    for (const row of (data ?? []) as QueueRow[]) {
      const rows = bySchool.get(row.school_id) ?? [];
      rows.push(row);
      bySchool.set(row.school_id, rows);
    }
    if (bySchool.size === 0) return { schools: [] };

    const configured = isApnsConfigured() || isFcmConfigured();
    if (!configured) {
      console.warn(
        "[document-push] Push is not configured, so new-document notifications are being skipped. " +
          "Set APNS_KEY_ID, APNS_TEAM_ID and APNS_PRIVATE_KEY (and APNS_BUNDLE_ID if not app.askmyschool) " +
          "for iOS, and/or FCM_SERVICE_ACCOUNT_JSON for Android."
      );
    }

    const schools: SchoolResult[] = [];
    // Sequential: a handful of schools at most, and it keeps APNs connections few.
    for (const [schoolId, rows] of bySchool) {
      try {
        schools.push(await runSchool(admin, schoolId, rows, configured, now));
      } catch (caught: unknown) {
        const message = caught instanceof Error ? caught.message : String(caught);
        console.error(`[document-push] school ${schoolId} failed`, caught);
        schools.push({ schoolId, pending: rows.length, result: "error", error: message });
      }
    }
    return { schools };
  } catch (caught: unknown) {
    console.error("[document-push] run failed", caught);
    return { schools: [], error: caught instanceof Error ? caught.message : String(caught) };
  }
}

async function runSchool(
  admin: Db,
  schoolId: string,
  rows: QueueRow[],
  configured: boolean,
  now: Date
): Promise<SchoolResult> {
  const base = { schoolId, pending: rows.length };
  const ids = rows.map((row) => row.document_id);

  const [{ data: school, error: schoolError }, { data: settingsRows, error: settingsError }] =
    await Promise.all([
      admin.from("schools").select("name, slug").eq("id", schoolId).maybeSingle(),
      admin
        .from("settings")
        .select("school_name, new_document_push_enabled")
        .eq("school_id", schoolId)
        .limit(1),
    ]);
  if (schoolError) throw new Error(`school: ${schoolError.message}`);
  if (settingsError) throw new Error(`settings: ${settingsError.message}`);
  if (!school) throw new Error("school not found");

  // No settings row means the default: on.
  const settings = settingsRows?.[0] as
    | { school_name: string | null; new_document_push_enabled: boolean | null }
    | undefined;
  if (settings?.new_document_push_enabled === false) {
    await finish(admin, ids, OUTCOMES.skippedDisabled, now);
    return { ...base, result: OUTCOMES.skippedDisabled };
  }

  // Drop them rather than hold them: once keys arrive, a backlog would all
  // land on parents at once.
  if (!configured) {
    await finish(admin, ids, OUTCOMES.skippedNotConfigured, now);
    return { ...base, result: OUTCOMES.skippedNotConfigured };
  }

  const { data: lastSent, error: lastError } = await admin
    .from("document_push_queue")
    .select("processed_at")
    .eq("school_id", schoolId)
    .eq("outcome", OUTCOMES.sent)
    .order("processed_at", { ascending: false })
    .limit(1);
  if (lastError) throw new Error(`last sent: ${lastError.message}`);

  const decision = shouldSend(rows, (lastSent?.[0]?.processed_at as string | null) ?? null, now);
  if (!decision.send) {
    return { ...base, result: decision.reason === "empty" ? "claimed_elsewhere" : decision.reason };
  }

  const docs: Array<{ id: string; title: string | null; status: string }> = [];
  for (const part of chunk(ids, ID_CHUNK)) {
    const { data, error } = await admin.from("documents").select("id, title, status").in("id", part);
    if (error) throw new Error(`documents: ${error.message}`);
    docs.push(...((data ?? []) as typeof docs));
  }

  const ready = new Set(docs.filter((doc) => doc.status === "ready").map((doc) => doc.id));
  const notReady = docs.filter((doc) => !ready.has(doc.id)).map((doc) => doc.id);
  if (notReady.length) await finish(admin, notReady, OUTCOMES.skippedNotReady, now);

  // Claim before sending, so an overlapping run can't send the same batch.
  const claimed = new Set<string>();
  for (const part of chunk([...ready], ID_CHUNK)) {
    const { data, error } = await admin
      .from("document_push_queue")
      .update({ processed_at: now.toISOString() })
      .is("processed_at", null)
      .in("document_id", part)
      .select("document_id");
    if (error) throw new Error(`claim: ${error.message}`);
    for (const row of data ?? []) claimed.add(row.document_id as string);
  }
  if (claimed.size === 0) {
    return { ...base, result: notReady.length ? OUTCOMES.skippedNotReady : "claimed_elsewhere" };
  }
  const claimedIds = ids.filter((id) => claimed.has(id));

  try {
    const recipients = await loadRecipients(admin, schoolId);
    if (recipients.length === 0) {
      await setOutcome(admin, claimedIds, OUTCOMES.skippedNoRecipients);
      return { ...base, result: OUTCOMES.skippedNoRecipients, documents: claimedIds.length };
    }

    const titleById = new Map(docs.map((doc) => [doc.id, doc.title ?? ""]));
    const message = buildDocumentPushMessage({
      schoolName: resolveSchoolName(school.name as string | null, settings?.school_name),
      schoolSlug: school.slug as string,
      titles: claimedIds.map((id) => titleById.get(id) ?? ""),
    });

    for (const part of chunk(recipients, ID_CHUNK)) {
      await sendPushToUsers(part, message);
    }

    await setOutcome(admin, claimedIds, OUTCOMES.sent);
    return {
      ...base,
      result: OUTCOMES.sent,
      documents: claimedIds.length,
      recipients: recipients.length,
    };
  } catch (caught: unknown) {
    // Claimed rows stay processed: retrying could send twice.
    await setOutcome(admin, claimedIds, OUTCOMES.failed).catch(() => undefined);
    throw caught;
  }
}

/** Approved parents at the school, minus those who turned these pushes off. */
async function loadRecipients(admin: Db, schoolId: string): Promise<string[]> {
  const parents: string[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from("school_memberships")
      .select("user_id")
      .eq("school_id", schoolId)
      .eq("role", "parent")
      .eq("approved", true)
      .order("user_id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`parents: ${error.message}`);
    parents.push(...(data ?? []).map((row) => row.user_id as string));
    if (!data || data.length < PAGE_SIZE) break;
  }

  const unique = [...new Set(parents)];
  const optedOut = new Set<string>();
  for (const part of chunk(unique, ID_CHUNK)) {
    const { data, error } = await admin
      .from("notification_preferences")
      .select("user_id")
      .eq("new_document_push", false)
      .in("user_id", part);
    if (error) throw new Error(`preferences: ${error.message}`);
    for (const row of data ?? []) optedOut.add(row.user_id as string);
  }

  return unique.filter((id) => !optedOut.has(id));
}

/** Mark still-unprocessed rows done with an outcome. */
async function finish(admin: Db, ids: string[], outcome: DocumentPushOutcome, now: Date) {
  for (const part of chunk(ids, ID_CHUNK)) {
    const { error } = await admin
      .from("document_push_queue")
      .update({ processed_at: now.toISOString(), outcome })
      .is("processed_at", null)
      .in("document_id", part);
    if (error) throw new Error(`mark ${outcome}: ${error.message}`);
  }
}

/** Record the outcome of rows this run claimed. */
async function setOutcome(admin: Db, ids: string[], outcome: DocumentPushOutcome) {
  for (const part of chunk(ids, ID_CHUNK)) {
    const { error } = await admin
      .from("document_push_queue")
      .update({ outcome })
      .in("document_id", part);
    if (error) throw new Error(`mark ${outcome}: ${error.message}`);
  }
}
