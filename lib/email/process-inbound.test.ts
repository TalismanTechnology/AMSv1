import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRawEmail, compileRedactions, applyRedactions } from "./inbound-content";
import { suppressDocumentPushes } from "./ingest-message";
import {
  processInboundEmail,
  type ProcessInboundDeps,
  type ProcessInboundParams,
} from "./process-inbound";
import { handleManualInbound, isBearerAuthorized } from "./manual-inbound";

// ── A minimal stand-in for the Supabase query builder ─────────────────

interface Op {
  table: string;
  action: "select" | "insert" | "update" | "upsert" | "delete";
  payload?: unknown;
  options?: unknown;
  filters: [string, ...unknown[]][];
}

type Reply = { data: unknown; error: { code?: string; message: string } | null };

class FakeDb {
  ops: Op[] = [];
  constructor(private handler: (op: Op) => Reply) {}

  get writes() {
    return this.ops.filter((op) => op.action !== "select");
  }

  from(table: string) {
    const op: Op = { table, action: "select", filters: [] };
    this.ops.push(op);
    const handler = this.handler;
    const builder = {
      select: () => builder,
      insert: (payload: unknown) => ((op.action = "insert"), (op.payload = payload), builder),
      update: (payload: unknown) => ((op.action = "update"), (op.payload = payload), builder),
      upsert: (payload: unknown, options: unknown) => (
        (op.action = "upsert"), (op.payload = payload), (op.options = options), builder
      ),
      delete: () => ((op.action = "delete"), builder),
      eq: (...args: unknown[]) => (op.filters.push(["eq", ...args]), builder),
      in: (...args: unknown[]) => (op.filters.push(["in", ...args]), builder),
      single: () => builder,
      maybeSingle: () => builder,
      then: (resolve: (r: Reply) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve()
          .then(() => handler(op))
          .then(resolve, reject),
    };
    return builder;
  }
}

const SCHOOL = "school-1";
const DIVISION = "division-upper";
const ok = (data: unknown): Reply => ({ data, error: null });

/** A school reachable at token "ams-abc" (Upper School address). */
function schoolDb(opts: {
  allowed?: readonly string[];
  enabled?: boolean;
  claim?: (op: Op) => Reply;
  holder?: unknown;
}) {
  return new FakeDb((op) => {
    if (op.table === "email_ingestion_addresses") {
      return ok([{ token: "ams-abc", school_id: SCHOOL, division_id: DIVISION }]);
    }
    if (op.table === "schools") {
      return ok({
        id: SCHOOL,
        email_ingestion_enabled: opts.enabled ?? true,
        allowed_sender_domains: opts.allowed ? [...opts.allowed] : ["school.org"],
      });
    }
    if (op.table === "email_ingestions") {
      if (op.action === "insert") {
        const status = (op.payload as { status: string }).status;
        if (status === "processing" && opts.claim) return opts.claim(op);
        return ok({ id: `row-${status}` });
      }
      if (op.action === "select") return ok(opts.holder ?? null);
      return ok(null);
    }
    throw new Error(`unexpected table ${op.table}`);
  });
}

function deps(db: FakeDb, ingested: string[] = ["doc-1", "doc-2"]) {
  const calls: { ingest: Parameters<ProcessInboundDeps["ingest"]>[0][]; divisions: unknown[][] } = {
    ingest: [],
    divisions: [],
  };
  const d: ProcessInboundDeps = {
    db: () => db as never,
    ingest: async (params) => {
      calls.ingest.push(params);
      return ingested;
    },
    addDivisions: async (docs, divisions) => {
      calls.divisions.push([docs, divisions]);
    },
  };
  return { d, calls };
}

const baseParams = (over: Partial<ProcessInboundParams> = {}): ProcessInboundParams => ({
  routing: { token: "ams-abc" },
  meta: {
    emailId: null,
    messageId: "<m1@school.org>",
    from: "Office <office@school.org>",
    subject: "Field trip",
  },
  loadContent: async () => {
    throw new Error("content not expected");
  },
  origin: "https://example.test",
  onReview: "reject",
  reasonSuffix: " (manual: gmail-intake)",
  suppressPush: true,
  ...over,
});

// ── Raw MIME ──────────────────────────────────────────────────────────

const PDF = Buffer.from("%PDF-1.4 fake pdf body");
const PNG = Buffer.from("fake png");

function rawMessage(opts: { messageId?: string | null; from?: string } = {}): Buffer {
  const lines = [
    `From: ${opts.from ?? "School Office <office@school.org>"}`,
    "To: Parent <parent@gmail.com>",
    "Cc: Other <other@gmail.com>",
    "Subject: Field trip on Friday",
    "Date: Mon, 19 Oct 2026 14:00:00 +0000",
    opts.messageId === null ? null : `Message-ID: ${opts.messageId ?? "<m1@school.org>"}`,
    "MIME-Version: 1.0",
    'Content-Type: multipart/mixed; boundary="b1"',
    "",
    "--b1",
    'Content-Type: multipart/alternative; boundary="b2"',
    "",
    "--b2",
    "Content-Type: text/plain; charset=utf-8",
    "",
    "The bus leaves at 8am. Call 555-123-4567 with questions.",
    "--b2",
    "Content-Type: text/html; charset=utf-8",
    "",
    "<p>The bus leaves at <b>8am</b>. Call 555-123-4567 with questions.</p>",
    "--b2--",
    "--b1",
    'Content-Type: application/pdf; name="permission.pdf"',
    'Content-Disposition: attachment; filename="permission.pdf"',
    "Content-Transfer-Encoding: base64",
    "",
    PDF.toString("base64"),
    "--b1",
    "Content-Type: image/png",
    'Content-Disposition: inline; filename="logo.png"',
    "Content-ID: <logo>",
    "Content-Transfer-Encoding: base64",
    "",
    PNG.toString("base64"),
    "--b1--",
    "",
  ].filter((l) => l !== null);
  return Buffer.from(lines.join("\r\n"));
}

test("parseRawEmail extracts headers, bodies and attachments", async () => {
  const parsed = await parseRawEmail(rawMessage());
  assert.equal(parsed.messageId, "<m1@school.org>");
  assert.equal(parsed.from, "School Office <office@school.org>");
  assert.equal(parsed.subject, "Field trip on Friday");
  assert.deepEqual(parsed.content.to, ["Parent <parent@gmail.com>"]);
  assert.deepEqual(parsed.content.cc, ["Other <other@gmail.com>"]);
  assert.equal(parsed.content.date, "2026-10-19T14:00:00.000Z");
  assert.match(parsed.content.text ?? "", /bus leaves at 8am/);
  assert.match(parsed.content.html ?? "", /<b>8am<\/b>/);

  const [pdf, png] = parsed.content.attachments;
  assert.equal(pdf.filename, "permission.pdf");
  assert.equal(pdf.contentType, "application/pdf");
  assert.equal(pdf.disposition, "attachment");
  assert.deepEqual(await pdf.load(), PDF);
  assert.equal(png.disposition, "inline");
});

test("redactions replace every match in text and html; bad patterns are reported", async () => {
  const parsed = await parseRawEmail(rawMessage());
  const compiled = compileRedactions([{ pattern: "\\d{3}-\\d{3}-\\d{4}", replace: "[phone]" }]);
  assert.ok("rules" in compiled);
  const redacted = applyRedactions(parsed.content, compiled.rules);
  assert.doesNotMatch(redacted.text ?? "", /555/);
  assert.match(redacted.text ?? "", /Call \[phone\]/);
  assert.match(redacted.html ?? "", /Call \[phone\]/);

  assert.ok("error" in compileRedactions([{ pattern: "(" }]));
  assert.ok("error" in compileRedactions([{ pattern: "" }]));
});

// ── Gate, routing, claiming ───────────────────────────────────────────

test("allowlisted sender is claimed, ingested with push suppression and settled", async () => {
  const db = schoolDb({});
  const { d, calls } = deps(db);
  const r = await processInboundEmail(baseParams(), d);

  assert.equal(r.status, "accepted");
  assert.equal(r.gate, "allow");
  assert.deepEqual(r.documentIds, ["doc-1", "doc-2"]);
  assert.equal(r.ingestionId, "row-processing");
  assert.equal(r.reason, "Ingested (manual: gmail-intake)");
  assert.equal(calls.ingest.length, 1);
  assert.equal(calls.ingest[0].suppressPush, true);
  assert.deepEqual(calls.ingest[0].divisionIds, [DIVISION]);

  const [claim, settle] = db.writes;
  assert.deepEqual(claim.payload, {
    school_id: SCHOOL,
    email_id: null,
    message_id: "<m1@school.org>",
    from_address: "Office <office@school.org>",
    subject: "Field trip",
    status: "processing",
    reason: "Ingesting (manual: gmail-intake)",
  });
  assert.equal(settle.action, "update");
  assert.deepEqual(settle.payload, {
    status: "accepted",
    reason: "Ingested (manual: gmail-intake)",
    document_ids: ["doc-1", "doc-2"],
  });
});

test("webhook defaults leave pushes alone", async () => {
  const db = schoolDb({});
  const { d, calls } = deps(db);
  await processInboundEmail(
    baseParams({
      routing: { recipients: ["ams-abc@in.example.test"], inboundDomain: "in.example.test" },
      onReview: "hold",
      reasonSuffix: undefined,
      suppressPush: undefined,
    }),
    d
  );
  assert.equal(calls.ingest[0].suppressPush, false);
  assert.equal((db.writes[1].payload as { reason: string }).reason, "Ingested");
});

test("sender outside the allowlist is logged as rejected_domain", async () => {
  const db = schoolDb({});
  const { d, calls } = deps(db);
  const r = await processInboundEmail(
    baseParams({ meta: { ...baseParams().meta, from: "x@evil.com" } }),
    d
  );
  assert.equal(r.status, "rejected_domain");
  assert.equal(r.gate, "reject");
  assert.equal(calls.ingest.length, 0);
  assert.equal(db.writes.length, 1);
  assert.equal((db.writes[0].payload as { status: string }).status, "rejected_domain");
});

test("empty allowlist: manual mail is rejected, webhook mail is held", async () => {
  const manualDb = schoolDb({ allowed: [] });
  const manual = await processInboundEmail(baseParams(), deps(manualDb).d);
  assert.equal(manual.status, "rejected_domain");
  assert.equal(manual.gate, "review");
  assert.match(manual.reason, /can't be held for review \(manual: gmail-intake\)$/);

  const hookDb = schoolDb({ allowed: [] });
  const hook = await processInboundEmail(
    baseParams({ onReview: "hold", meta: { ...baseParams().meta, emailId: "re_1" } }),
    deps(hookDb).d
  );
  assert.equal(hook.status, "pending_review");
  const held = hookDb.writes[0].payload as Record<string, unknown>;
  assert.equal(held.status, "pending_review");
  assert.equal(held.email_id, "re_1");
  assert.deepEqual(held.division_ids, [DIVISION]);
});

test("unknown token and disabled school are logged and nothing is ingested", async () => {
  const unknownDb = new FakeDb((op) =>
    op.table === "email_ingestion_addresses" ? ok([]) : ok({ id: "row" })
  );
  const unknown = await processInboundEmail(baseParams({ routing: { token: "ams-nope" } }), deps(unknownDb).d);
  assert.equal(unknown.status, "rejected_unknown");
  assert.equal((unknownDb.writes[0].payload as { school_id: unknown }).school_id, null);

  const disabledDb = schoolDb({ enabled: false });
  const disabled = await processInboundEmail(baseParams(), deps(disabledDb).d);
  assert.equal(disabled.status, "rejected_disabled");
});

test("a message already accepted is a duplicate: no new documents", async () => {
  const db = schoolDb({
    claim: () => ({ data: null, error: { code: "23505", message: "duplicate key" } }),
    holder: { id: "row-old", status: "accepted", created_at: new Date().toISOString(), document_ids: ["doc-old"] },
  });
  const { d, calls } = deps(db);
  const r = await processInboundEmail(baseParams(), d);

  assert.equal(r.status, "duplicate");
  assert.equal(r.httpStatus, 200);
  assert.deepEqual(r.documentIds, ["doc-old"]);
  assert.equal(r.ingestionId, "row-old");
  assert.equal(calls.ingest.length, 0);
  // The later copy's divisions land on the existing documents.
  assert.deepEqual(calls.divisions, [[["doc-old"], [DIVISION]]]);
});

test("a message being ingested right now is in_progress (409 when it carries divisions)", async () => {
  const db = schoolDb({
    claim: () => ({ data: null, error: { code: "23505", message: "duplicate key" } }),
    holder: { id: "row-live", status: "processing", created_at: new Date().toISOString() },
  });
  const r = await processInboundEmail(baseParams(), deps(db).d);
  assert.equal(r.status, "in_progress");
  assert.equal(r.httpStatus, 409);
});

test("a failed ingest settles the claim as error and answers 500", async () => {
  const db = schoolDb({});
  const { d } = deps(db);
  d.ingest = async () => {
    throw new Error("storage down");
  };
  const r = await processInboundEmail(baseParams(), d);
  assert.equal(r.status, "error");
  assert.equal(r.httpStatus, 500);
  assert.equal(r.error, "storage down");
  assert.equal((db.writes[1].payload as { status: string }).status, "error");
});

// ── Dry run ───────────────────────────────────────────────────────────

test("dry run reports the decision and writes nothing", async () => {
  for (const [opts, expected] of [
    [{}, { status: "accepted", duplicate: false }],
    [{ holder: { id: "row-old", status: "accepted", created_at: new Date().toISOString(), document_ids: ["d"] } }, { status: "duplicate", duplicate: true }],
    [{ allowed: [] }, { status: "rejected_domain" }],
    [{ enabled: false }, { status: "rejected_disabled" }],
  ] as const) {
    const db = schoolDb(opts);
    const { d, calls } = deps(db);
    const r = await processInboundEmail(baseParams({ dryRun: true }), d);
    assert.equal(r.dryRun, true);
    assert.equal(r.status, expected.status);
    if ("duplicate" in expected) assert.equal(r.duplicate, expected.duplicate);
    assert.equal(db.writes.length, 0, `no writes for ${expected.status}`);
    assert.equal(calls.ingest.length, 0);
    assert.equal(calls.divisions.length, 0);
  }
});

// ── Push suppression ──────────────────────────────────────────────────

test("suppressDocumentPushes pre-marks each document as handled, never overwriting", async () => {
  const db = new FakeDb(() => ok(null));
  await suppressDocumentPushes(SCHOOL, ["doc-1", "doc-2"], db as never);
  assert.equal(db.ops.length, 1);
  const [op] = db.ops;
  assert.equal(op.table, "document_push_queue");
  assert.equal(op.action, "upsert");
  assert.deepEqual(op.options, { onConflict: "document_id", ignoreDuplicates: true });
  const rows = op.payload as Record<string, unknown>[];
  assert.deepEqual(rows.map((r) => [r.document_id, r.school_id, r.outcome]), [
    ["doc-1", SCHOOL, "skipped_disabled"],
    ["doc-2", SCHOOL, "skipped_disabled"],
  ]);
  assert.ok(rows.every((r) => typeof r.processed_at === "string"));

  const failing = new FakeDb(() => ({ data: null, error: { message: "nope" } }));
  await assert.rejects(suppressDocumentPushes(SCHOOL, ["doc-1"], failing as never), /nope/);
});

// ── Manual endpoint ───────────────────────────────────────────────────

const SECRET = "s3cret-value";

function manualRequest(body: unknown, auth: string | null = `Bearer ${SECRET}`) {
  return new Request("https://example.test/api/inbound-email/manual", {
    method: "POST",
    headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) },
    body: JSON.stringify(body),
  });
}

test("isBearerAuthorized needs the exact secret as a Bearer token", () => {
  assert.equal(isBearerAuthorized(`Bearer ${SECRET}`, SECRET), true);
  assert.equal(isBearerAuthorized(`Bearer ${SECRET}x`, SECRET), false);
  assert.equal(isBearerAuthorized(`Bearer wrong-value!`, SECRET), false);
  assert.equal(isBearerAuthorized(SECRET, SECRET), false);
  assert.equal(isBearerAuthorized(null, SECRET), false);
  assert.equal(isBearerAuthorized("Bearer ", ""), false);
});

test("manual endpoint: 401 without valid auth, 500 when CRON_SECRET is unset", async () => {
  let called = false;
  const manualDeps = {
    process: async () => {
      called = true;
      throw new Error("must not run");
    },
    folders: async () => [],
  };
  const body = { token: "ams-abc", raw: rawMessage().toString("base64") };
  for (const auth of [null, "Bearer nope", `Basic ${SECRET}`]) {
    const r = await handleManualInbound(manualRequest(body, auth), { secret: SECRET, origin: "x" }, manualDeps);
    assert.equal(r.status, 401);
  }
  const unset = await handleManualInbound(manualRequest(body), { secret: undefined, origin: "x" }, manualDeps);
  assert.equal(unset.status, 500);
  assert.equal(called, false);
});

test("manual endpoint: validates the body", async () => {
  const manualDeps = { process: processInboundEmail, folders: async () => [] };
  const cases: [unknown, RegExp][] = [
    [{ raw: "eA==" }, /token/],
    [{ token: "ams-abc" }, /raw/],
    [{ token: "ams-abc", raw: rawMessage().toString("base64"), redactions: [{ pattern: "(" }] }, /Invalid redaction/],
    [{ token: "ams-abc", raw: rawMessage().toString("base64"), source: "bad source!" }, /source/],
    [{ token: "ams-abc", raw: rawMessage({ messageId: null }).toString("base64") }, /Message-ID/],
  ];
  for (const [body, error] of cases) {
    const r = await handleManualInbound(manualRequest(body), { secret: SECRET, origin: "x" }, manualDeps);
    assert.equal(r.status, 400);
    assert.match(String(r.body.error), error);
  }
});

test("manual endpoint: ingests the parsed message through the shared pipeline", async () => {
  const db = schoolDb({});
  const { d, calls } = deps(db);
  const r = await handleManualInbound(
    manualRequest({
      token: "AMS-abc",
      // Gmail's API returns base64url.
      raw: rawMessage().toString("base64url"),
      source: "gmail-intake",
      redactions: [{ pattern: "555-\\d{3}-\\d{4}" }],
    }),
    { secret: SECRET, origin: "https://example.test" },
    {
      process: processInboundEmail,
      processDeps: d,
      folders: async (ids) => ids.map((id) => ({ documentId: id, folderId: "f1", folder: "Trips" })),
    }
  );

  assert.equal(r.status, 200);
  assert.equal(r.body.status, "accepted");
  assert.deepEqual(r.body.documentIds, ["doc-1", "doc-2"]);
  assert.equal(r.body.ingestionId, "row-processing");
  assert.equal(r.body.reason, "Ingested (manual: gmail-intake)");
  assert.equal((r.body.folders as unknown[]).length, 2);

  const [ingest] = calls.ingest;
  assert.equal(ingest.suppressPush, true, "push suppressed by default");
  assert.equal(ingest.fromAddress, "office@school.org");
  const content = await ingest.loadContent();
  assert.match(content.text ?? "", /Call \[redacted\]/);
  assert.match(content.html ?? "", /Call \[redacted\]/);
  assert.equal(content.attachments.length, 2);

  const claim = db.writes[0].payload as Record<string, unknown>;
  assert.equal(claim.email_id, null);
  assert.equal(claim.message_id, "<m1@school.org>");
});

test("manual endpoint: suppressPush false lets pushes through", async () => {
  const db = schoolDb({});
  const { d, calls } = deps(db);
  await handleManualInbound(
    manualRequest({ token: "ams-abc", raw: rawMessage().toString("base64"), suppressPush: false }),
    { secret: SECRET, origin: "x" },
    { process: processInboundEmail, processDeps: d, folders: async () => [] }
  );
  assert.equal(calls.ingest[0].suppressPush, false);
});

test("manual endpoint: dry run previews the message and writes nothing", async () => {
  const db = schoolDb({
    holder: { id: "row-old", status: "accepted", created_at: new Date().toISOString(), document_ids: ["doc-old"] },
  });
  const { d, calls } = deps(db);
  const r = await handleManualInbound(
    manualRequest({ token: "ams-abc", raw: rawMessage().toString("base64"), dryRun: true }),
    { secret: SECRET, origin: "x" },
    { process: processInboundEmail, processDeps: d, folders: async () => assert.fail("no folders") }
  );

  assert.equal(r.status, 200);
  assert.equal(r.body.status, "dry_run");
  assert.equal(r.body.outcome, "duplicate");
  assert.equal(r.body.duplicate, true);
  assert.equal(r.body.gate, "allow");
  assert.equal(r.body.message_id, "<m1@school.org>");
  assert.equal(r.body.subject, "Field trip on Friday");
  assert.match(String(r.body.text_preview), /^The bus leaves at 8am/);
  assert.deepEqual(r.body.attachments, [
    { filename: "permission.pdf", contentType: "application/pdf", disposition: "attachment", ingest: true },
    { filename: "logo.png", contentType: "image/png", disposition: "inline", ingest: false },
  ]);
  assert.equal(db.writes.length, 0);
  assert.equal(calls.ingest.length, 0);
});
