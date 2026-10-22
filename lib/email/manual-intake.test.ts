import { test } from "node:test";
import assert from "node:assert/strict";
import type { InboundContent } from "./inbound-content";
import {
  bodyProbes,
  findContentDuplicates,
  matchAttachment,
  matchBodyByChunks,
  matchBodyByMeta,
  normalizeTitle,
  type ExistingDoc,
} from "./content-dedupe";
import {
  findForbiddenTokens,
  recipientAddresses,
  sanitizeInboundContent,
} from "./sanitize-inbound";
import { ensureDocumentFolder, waitForProcessing } from "./post-process";
import {
  processInboundEmail,
  type ProcessInboundDeps,
  type ProcessInboundParams,
} from "./process-inbound";
import { handleManualInbound, type ManualInboundDeps } from "./manual-inbound";
import type { IngestedEmail } from "./ingest-message";

// ── A Supabase query-builder stand-in that records every call ─────────

interface Op {
  table: string;
  action: "select" | "insert" | "update" | "upsert" | "delete";
  payload?: unknown;
  calls: [string, ...unknown[]][];
}
type Reply = { data: unknown; error: { code?: string; message: string } | null; count?: number };

class FakeDb {
  ops: Op[] = [];
  constructor(private handler: (op: Op) => Reply) {}
  get writes() {
    return this.ops.filter((op) => op.action !== "select");
  }
  from(table: string) {
    const op: Op = { table, action: "select", calls: [] };
    this.ops.push(op);
    const handler = this.handler;
    const chain = (name: string) => (...args: unknown[]) => (op.calls.push([name, ...args]), builder);
    const builder: Record<string, unknown> = {
      insert: (p: unknown) => ((op.action = "insert"), (op.payload = p), builder),
      update: (p: unknown) => ((op.action = "update"), (op.payload = p), builder),
      upsert: (p: unknown) => ((op.action = "upsert"), (op.payload = p), builder),
      delete: () => ((op.action = "delete"), builder),
      then: (resolve: (r: Reply) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve()
          .then(() => handler(op))
          .then(resolve, reject),
    };
    for (const name of ["select", "eq", "in", "is", "neq", "ilike", "limit", "order", "range", "single", "maybeSingle"]) {
      builder[name] = chain(name);
    }
    return builder;
  }
}
const ok = (data: unknown, count?: number): Reply => ({ data, error: null, count });
const arg = (op: Op, name: string) => op.calls.find((c) => c[0] === name);

function content(over: Partial<InboundContent> = {}): InboundContent {
  return {
    subject: "Curriculum Night",
    from: "Collegiate School <noreply@collegiateschoolorg.myenotice.com>",
    to: ["Parent Person <parent.person@gmail.com>"],
    cc: [],
    replyTo: [],
    date: "2026-10-19T14:00:00.000Z",
    text: "Join us Thursday.",
    html: null,
    attachments: [],
    ...over,
  };
}

// ── Content dedupe ────────────────────────────────────────────────────

const doc = (over: Partial<ExistingDoc>): ExistingDoc => ({
  id: "d",
  title: null,
  file_name: null,
  email_meta: null,
  ...over,
});

test("normalizeTitle drops Re:/Fwd:, extensions and punctuation", () => {
  assert.equal(normalizeTitle("Fwd: Curriculum Night — Schedule.pdf"), "curriculum night schedule");
  assert.equal(normalizeTitle("RE: Bus_Update.docx"), "bus update");
  assert.equal(normalizeTitle(null), "");
});

test("matchBodyByMeta: same email subject+date, or same title", () => {
  const docs = [
    doc({ id: "e1", title: "Curriculum Night", email_meta: { subject: "Curriculum Night", date: "2026-10-19T09:00:00Z" } }),
    doc({ id: "p1", title: "Bus Update", file_name: "bus_update.pdf" }),
  ];
  assert.deepEqual(matchBodyByMeta(docs, { subject: "Re: curriculum night", date: "2026-10-19T20:00:00Z" }), {
    documentId: "e1",
    title: "Curriculum Night",
    why: "same email subject and date",
  });
  assert.equal(matchBodyByMeta(docs, { subject: "Bus update", date: null })?.documentId, "p1");
  assert.equal(matchBodyByMeta(docs, { subject: "Something else", date: null }), null);
  assert.equal(matchBodyByMeta(docs, { subject: "", date: null }), null);
});

test("matchBodyByMeta: a recurring subject on another day is a new email", () => {
  const docs = [doc({ id: "w1", title: "Weekly Update", email_meta: { subject: "Weekly Update", date: "2026-10-12T12:00:00Z" } })];
  assert.equal(matchBodyByMeta(docs, { subject: "Weekly Update", date: "2026-10-19T12:00:00Z" }), null);
  // An undated copy can't be told apart, so it still matches.
  assert.equal(matchBodyByMeta(docs, { subject: "Weekly Update", date: null })?.documentId, "w1");
});

test("matchAttachment matches title or file name", () => {
  const docs = [doc({ id: "a1", title: "Permission Slip", file_name: "permission_slip.pdf" })];
  assert.equal(matchAttachment(docs, "Permission Slip.pdf")?.documentId, "a1");
  assert.equal(matchAttachment(docs, "permission_slip.PDF")?.documentId, "a1");
  assert.equal(matchAttachment(docs, "Other.pdf"), null);
});

const LONG_BODY = Array.from({ length: 60 }, (_, i) => `word${"abcdefghij"[i % 10]}${"klmnopqrst"[Math.floor(i / 10)]}`)
  .map((w) => w.replace(/\d/g, ""))
  .join(" ");

test("bodyProbes needs 30 words of 4+ letters and takes runs at 30% and 60%", () => {
  assert.equal(bodyProbes("too short to fingerprint"), null);
  const probes = bodyProbes(LONG_BODY);
  assert.ok(probes);
  const words = LONG_BODY.split(" ");
  assert.deepEqual(probes[0], words.slice(18, 22));
  assert.deepEqual(probes[1], words.slice(36, 40));
});

test("matchBodyByChunks needs both probes to agree in one document", async () => {
  const both = new FakeDb((op) => {
    if (arg(op, "eq")) return ok([{ document_id: "c1" }, { document_id: "c2" }]);
    assert.deepEqual(arg(op, "in"), ["in", "document_id", ["c1", "c2"]]);
    return ok([{ document_id: "c2" }]);
  });
  const hit = await matchBodyByChunks(both as never, "s1", LONG_BODY, [doc({ id: "c2", title: "Newsletter.pdf" })]);
  assert.deepEqual(hit, { documentId: "c2", title: "Newsletter.pdf", why: "same body text already indexed" });
  const pattern = String(arg(both.ops[0], "ilike")?.[2]);
  assert.match(pattern, /^%[A-Za-z]+%[A-Za-z]+%[A-Za-z]+%[A-Za-z]+%$/);

  const one = new FakeDb((op) => ok(arg(op, "eq") ? [{ document_id: "c1" }] : []));
  assert.equal(await matchBodyByChunks(one as never, "s1", LONG_BODY, []), null);

  const failing = new FakeDb(() => ({ data: null, error: { message: "statement timeout" } }));
  assert.equal(await matchBodyByChunks(failing as never, "s1", LONG_BODY, []), null, "fails open");
});

test("findContentDuplicates pages through documents and checks each ingestible attachment", async () => {
  const page1 = Array.from({ length: 1000 }, (_, i) => doc({ id: `x${i}`, title: `Doc ${i}` }));
  const db = new FakeDb((op) => {
    if (op.table === "documents") {
      const [, from] = arg(op, "range") as [string, number, number];
      return ok(from === 0 ? page1 : [doc({ id: "slip", title: "Permission Slip" })]);
    }
    return ok([]);
  });
  const att = (filename: string, disposition = "attachment") => ({
    filename,
    contentType: "application/pdf",
    disposition,
    load: async () => Buffer.from("x"),
  });
  const found = await findContentDuplicates(
    {
      schoolId: "s1",
      subject: "Curriculum Night",
      content: content({ attachments: [att("Permission Slip.pdf"), att("logo.png", "inline"), att("New.pdf")] }),
    },
    db as never
  );
  assert.equal(db.ops.filter((o) => o.table === "documents").length, 2);
  assert.equal(found.body, null);
  assert.deepEqual(
    found.attachments.map((a) => [a.filename, a.match?.documentId ?? null]),
    [["Permission Slip.pdf", "slip"], ["New.pdf", null]]
  );
});

// ── Sanitizing ────────────────────────────────────────────────────────

const ENOTIFY_HTML = [
  '<p>If you are having trouble viewing this email, <a href="https://x.myenotice.com/v/1">click here</a>.</p>',
  '<p>Curriculum Night is <a href="https://collegiateschoolorg.myenotice.com/c/abc123/parent.person%40gmail.com">this Thursday</a>.</p>',
  '<p>See <a href="https://www.collegiateschool.org/calendar">the calendar</a>.</p>',
  '<img src="https://collegiateschoolorg.myenotice.com/o/abc123" width="1" height="1">',
  '<img src="https://cdn.example/banner.png" width="600">',
  "<p>Sent to parent.person@gmail.com</p>",
  '<p>You may unsubscribe if you no longer wish to receive emails sent to this recipient list.</p>',
  '<p><a href="https://x.myenotice.com/u/abc">Unsubscribe</a></p>',
].join("");

test("sanitizeInboundContent strips trackers, unsubscribe lines and recipients", () => {
  const c = content({ text: "<!-- placeholder -->", html: ENOTIFY_HTML, cc: ["other@gmail.com"] });
  const out = sanitizeInboundContent(c, recipientAddresses(c, ["parent.person@gmail.com"]));
  const html = out.html ?? "";
  assert.doesNotMatch(html, /myenotice\.com\/[co]\//, "tracked link and pixel gone");
  assert.match(html, /this Thursday/, "tracked link's words kept");
  assert.match(html, /href="https:\/\/www\.collegiateschool\.org\/calendar"/, "ordinary link kept");
  assert.match(html, /banner\.png/, "real images kept");
  assert.doesNotMatch(html, /parent\.person/i);
  assert.doesNotMatch(html, /may unsubscribe|trouble viewing/i);
  // The placeholder text part is replaced by text from the sanitized HTML.
  assert.match(out.text ?? "", /Curriculum Night is this Thursday\./);
  assert.doesNotMatch(out.text ?? "", /placeholder|parent\.person|unsubscribe if/i);
  assert.deepEqual(out.to, []);
  assert.deepEqual(out.cc, []);
});

test("sanitizeInboundContent cleans a real text part and keeps the sender's own address", () => {
  const c = content({
    from: "Ms. Teacher <teacher@collegiateschool.org>",
    to: ["teacher@collegiateschool.org"],
    text: "Questions? Write teacher@collegiateschool.org.\nForwarded to parent.person@gmail.com\n<https://x.myenotice.com/c/zz>",
  });
  const recipients = recipientAddresses(c, ["Parent.Person@gmail.com"]);
  assert.deepEqual(recipients, ["parent.person@gmail.com"]);
  const out = sanitizeInboundContent(c, recipients);
  assert.match(out.text ?? "", /teacher@collegiateschool\.org/);
  assert.doesNotMatch(out.text ?? "", /parent\.person|myenotice/);
});

test("findForbiddenTokens looks at everything that would be stored, case-insensitively", () => {
  const c = content({ text: "Dear JESSE,", attachments: [] });
  assert.deepEqual(findForbiddenTokens(c, ["jesse", "marmon", " "]), ["jesse"]);
  assert.deepEqual(findForbiddenTokens(content({ to: ["Marmon <m@x.com>"] }), ["marmon"]), ["marmon"]);
  assert.deepEqual(findForbiddenTokens(content(), ["jesse"]), []);
});

// ── Processing wait and folders ───────────────────────────────────────

test("waitForProcessing polls until nothing is processing, then counts chunks", async () => {
  let reads = 0;
  const db = new FakeDb((op) => {
    if (op.table === "documents") {
      reads++;
      return ok([{ id: "d1", status: reads < 3 ? "processing" : "ready", error_message: null }]);
    }
    return ok(null, 7);
  });
  let slept = 0;
  const states = await waitForProcessing(["d1"], Date.now() + 60_000, db as never, async () => void slept++);
  assert.equal(slept, 2);
  assert.deepEqual(states, [{ documentId: "d1", status: "ready", chunks: 7, error: null }]);
});

test("waitForProcessing gives up at the deadline", async () => {
  const db = new FakeDb((op) =>
    op.table === "documents" ? ok([{ id: "d1", status: "processing", error_message: null }]) : ok(null, 0)
  );
  const states = await waitForProcessing(["d1"], Date.now(), db as never, async () => assert.fail("no sleep"));
  assert.equal(states[0].status, "processing");
});

function folderDb(docFolder: string | null) {
  return new FakeDb((op) => {
    if (op.table === "documents" && op.action === "select") {
      return ok({ id: "d1", title: "Bus", school_id: "s1", category_id: "c", folder_id: docFolder, source: "email", summary: "Buses", text_url: null });
    }
    if (op.table === "documents" && op.action === "update") return ok([{ id: "d1" }]);
    if (op.table === "folders") {
      return ok([
        { id: "f-resp", name: "Responses", parent_id: null },
        { id: "f-resp-sub", name: "Old", parent_id: "f-resp" },
        { id: "f-trans", name: "Transportation", parent_id: null },
      ]);
    }
    throw new Error(`unexpected ${op.table}`);
  });
}

test("ensureDocumentFolder files an unfiled doc into an existing folder", async () => {
  const db = folderDb(null);
  const r = await ensureDocumentFolder("d1", db as never, async () => ({ folder_id: "f-trans" }));
  assert.deepEqual(r, { folderId: "f-trans", folder: "Transportation" });
  const update = db.writes[0];
  assert.deepEqual(update.payload, { folder_id: "f-trans" });
  assert.deepEqual(arg(update, "is"), ["is", "folder_id", null], "only fills an empty folder");
});

test("ensureDocumentFolder never files into Responses (or below) and leaves filed docs alone", async () => {
  for (const id of ["f-resp", "f-resp-sub"]) {
    const db = folderDb(null);
    const r = await ensureDocumentFolder("d1", db as never, async () => ({ folder_id: id }));
    assert.equal(r.folderId, null);
    assert.equal(r.note, "AI found no fitting folder");
    assert.equal(db.writes.length, 0);
  }
  const filed = folderDb("f-trans");
  const r = await ensureDocumentFolder("d1", filed as never, async () => assert.fail("no sorting"));
  assert.deepEqual(r, { folderId: "f-trans", folder: "Transportation" });

  const failing = await ensureDocumentFolder("d1", folderDb(null) as never, async () => {
    throw new Error("model down");
  });
  assert.equal(failing.note, "folder sort failed: model down");
});

// ── Pipeline: content duplicates ──────────────────────────────────────

function schoolDb() {
  return new FakeDb((op) => {
    if (op.table === "email_ingestion_addresses") return ok([{ token: "ams-abc", school_id: "s1", division_id: null }]);
    if (op.table === "schools") return ok({ id: "s1", email_ingestion_enabled: true, allowed_sender_domains: ["collegiateschool.org", "collegiateschoolorg.myenotice.com"] });
    if (op.table === "email_ingestions") {
      if (op.action === "insert") return ok({ id: `row-${(op.payload as { status: string }).status}` });
      return ok(null);
    }
    throw new Error(`unexpected ${op.table}`);
  });
}

const MATCH = { documentId: "old-1", title: "Curriculum Night", why: "same email subject and date" };

function pipelineDeps(db: FakeDb, result: IngestedEmail, found?: Awaited<ReturnType<ProcessInboundDeps["findDuplicates"]>>) {
  const calls: Parameters<ProcessInboundDeps["ingest"]>[0][] = [];
  const d: ProcessInboundDeps = {
    db: () => db as never,
    ingest: async (p) => (calls.push(p), result),
    addDivisions: async () => {},
    findDuplicates: async () => found ?? assert.fail("no content check"),
  };
  return { d, calls };
}

const params = (over: Partial<ProcessInboundParams> = {}): ProcessInboundParams => ({
  routing: { token: "ams-abc" },
  meta: { emailId: null, messageId: "<m1@collegiateschool.org>", from: "office@collegiateschool.org", subject: "Curriculum Night" },
  loadContent: async () => content(),
  origin: "https://example.test",
  onReview: "reject",
  reasonSuffix: " (manual: gmail-intake)",
  contentDedupe: true,
  ...over,
});

test("content already in the library settles the claim as duplicate with the matched docs", async () => {
  const db = schoolDb();
  const { d, calls } = pipelineDeps(db, { documentIds: [], duplicates: [{ part: "body", match: MATCH }] });
  const r = await processInboundEmail(params({ processingDeadline: 123 }), d);

  assert.equal(calls[0].dedupe, true);
  assert.equal(calls[0].processingDeadline, 123);
  assert.equal(r.status, "duplicate");
  assert.equal(r.httpStatus, 200);
  assert.deepEqual(r.documentIds, ["old-1"]);
  assert.equal(r.ingestionId, "row-processing");
  assert.equal(r.reason, 'Already in the library: body = "Curriculum Night" (same email subject and date) (manual: gmail-intake)');
  const settle = db.writes.find((w) => w.action === "update");
  assert.deepEqual(settle?.payload, {
    status: "duplicate",
    reason: 'Already in the library: body = "Curriculum Night" (same email subject and date) (manual: gmail-intake)',
    document_ids: ["old-1"],
  });
});

test("new parts are ingested and the skipped duplicates named in the reason", async () => {
  const db = schoolDb();
  const slip = { documentId: "old-2", title: "Permission Slip", why: "same title" };
  const { d } = pipelineDeps(db, { documentIds: ["new-1"], duplicates: [{ part: "Permission Slip.pdf", match: slip }] });
  const r = await processInboundEmail(params(), d);
  assert.equal(r.status, "accepted");
  assert.deepEqual(r.documentIds, ["new-1"]);
  assert.match(r.reason, /^Ingested; Already in the library: Permission Slip\.pdf = "Permission Slip" \(same title\)/);
});

test("the webhook default doesn't content-check", async () => {
  const { d, calls } = pipelineDeps(schoolDb(), { documentIds: ["new-1"], duplicates: [] });
  await processInboundEmail(params({ contentDedupe: undefined }), d);
  assert.equal(calls[0].dedupe, false);
  assert.equal(calls[0].processingDeadline, undefined);
});

test("dry run reports content duplicates and writes nothing", async () => {
  const db = schoolDb();
  const { d, calls } = pipelineDeps(db, { documentIds: [], duplicates: [] }, { body: MATCH, attachments: [] });
  const r = await processInboundEmail(params({ dryRun: true }), d);
  assert.equal(r.status, "duplicate");
  assert.equal(r.duplicate, true);
  assert.deepEqual(r.documentIds, ["old-1"]);
  assert.equal(r.contentDuplicates?.[0].part, "body");
  assert.equal(db.writes.length, 0);
  assert.equal(calls.length, 0);

  const partial = pipelineDeps(schoolDb(), { documentIds: [], duplicates: [] }, {
    body: MATCH,
    attachments: [{ filename: "New.pdf", match: null }],
  });
  const r2 = await processInboundEmail(params({ dryRun: true }), partial.d);
  assert.equal(r2.status, "accepted");
  assert.match(r2.reason, /^Would ingest; Already in the library: body/);
});

// ── Manual endpoint options ───────────────────────────────────────────

const SECRET = "s3cret-value";

function rawEnotify(): string {
  return Buffer.from(
    [
      "From: Collegiate School <noreply@collegiateschoolorg.myenotice.com>",
      "To: Parent Person <parent.person@gmail.com>",
      "Delivered-To: parent.person@gmail.com",
      "Subject: Curriculum Night",
      "Date: Mon, 19 Oct 2026 14:00:00 +0000",
      "Message-ID: <e1@myenotice.com>",
      "MIME-Version: 1.0",
      'Content-Type: multipart/alternative; boundary="b"',
      "",
      "--b",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "<!-- placeholder -->",
      "--b",
      "Content-Type: text/html; charset=utf-8",
      "",
      ENOTIFY_HTML,
      "--b--",
      "",
    ].join("\r\n")
  ).toString("base64url");
}

const request = (body: unknown) =>
  new Request("https://example.test/api/inbound-email/manual", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${SECRET}` },
    body: JSON.stringify(body),
  });

function manualDeps(result: IngestedEmail) {
  const db = schoolDb();
  const p = pipelineDeps(db, result);
  const finalized: [string[], number][] = [];
  const deps: ManualInboundDeps = {
    process: processInboundEmail,
    processDeps: p.d,
    folders: async (ids) => ids.map((id) => ({ documentId: id, folderId: "f-old", folder: "Events" })),
    finalize: async (ids, deadline) => {
      finalized.push([ids, deadline]);
      return ids.map((id) => ({ documentId: id, folderId: "f1", folder: "Events", status: "ready", chunks: 3 }));
    },
  };
  return { db, deps, calls: p.calls, finalized };
}

test("manual: sanitizes, content-checks, waits for processing and files by default", async () => {
  const m = manualDeps({ documentIds: ["new-1"], duplicates: [] });
  const before = Date.now();
  const r = await handleManualInbound(
    request({ token: "ams-abc", raw: rawEnotify(), source: "gmail-intake" }),
    { secret: SECRET, origin: "x" },
    m.deps
  );
  assert.equal(r.status, 200);
  assert.equal(r.body.status, "accepted");
  assert.equal(r.body.ready, true);
  assert.deepEqual(r.body.folders, [{ documentId: "new-1", folderId: "f1", folder: "Events", status: "ready", chunks: 3 }]);

  const ingest = m.calls[0];
  assert.equal(ingest.dedupe, true);
  assert.ok(ingest.processingDeadline! >= before + 200_000 && ingest.processingDeadline! <= Date.now() + 240_000);
  assert.equal(m.finalized[0][1], ingest.processingDeadline);
  const stored = await ingest.loadContent();
  assert.deepEqual(stored.to, []);
  assert.doesNotMatch(stored.html ?? "", /myenotice\.com\/[co]\/|parent\.person/);
  assert.match(stored.text ?? "", /Curriculum Night is this Thursday/);
});

test("manual: sanitize/ensureFolder/contentDedupe false keep the old behavior", async () => {
  const m = manualDeps({ documentIds: ["new-1"], duplicates: [] });
  const r = await handleManualInbound(
    request({ token: "ams-abc", raw: rawEnotify(), sanitize: false, ensureFolder: false, contentDedupe: false }),
    { secret: SECRET, origin: "x" },
    m.deps
  );
  assert.equal(r.body.ready, undefined);
  assert.equal(m.finalized.length, 0);
  assert.deepEqual(r.body.folders, [{ documentId: "new-1", folderId: "f-old", folder: "Events" }]);
  assert.equal(m.calls[0].dedupe, false);
  assert.equal(m.calls[0].processingDeadline, undefined);
  const stored = await m.calls[0].loadContent();
  assert.deepEqual(stored.to, ["Parent Person <parent.person@gmail.com>"]);
});

test("manual: a content duplicate reports the matched docs and their folders", async () => {
  const m = manualDeps({ documentIds: [], duplicates: [{ part: "body", match: MATCH }] });
  const r = await handleManualInbound(request({ token: "ams-abc", raw: rawEnotify() }), { secret: SECRET, origin: "x" }, m.deps);
  assert.equal(r.status, 200);
  assert.equal(r.body.status, "duplicate");
  assert.deepEqual(r.body.documentIds, ["old-1"]);
  assert.deepEqual(r.body.folders, [{ documentId: "old-1", folderId: "f-old", folder: "Events" }]);
  assert.equal(m.finalized.length, 0, "existing docs are never re-filed");
});

test("manual: forbidden tokens refuse the message with 422 and write nothing", async () => {
  for (const dryRun of [false, true]) {
    const m = manualDeps({ documentIds: ["new-1"], duplicates: [] });
    const r = await handleManualInbound(
      request({ token: "ams-abc", raw: rawEnotify(), forbiddenTokens: ["thursday", "marmon"], dryRun }),
      { secret: SECRET, origin: "x" },
      m.deps
    );
    assert.equal(r.status, 422);
    assert.equal(r.body.status, "rejected_personal");
    assert.deepEqual(r.body.tokens, ["thursday"]);
    assert.equal(r.body.dryRun, dryRun);
    assert.equal(m.db.ops.length, 0, "no log row, no lookups");
    assert.equal(m.calls.length, 0);
  }
  // The recipient's address is scrubbed before the check, so it alone doesn't trip it.
  const m = manualDeps({ documentIds: ["new-1"], duplicates: [] });
  const r = await handleManualInbound(
    request({ token: "ams-abc", raw: rawEnotify(), forbiddenTokens: ["parent.person"] }),
    { secret: SECRET, origin: "x" },
    m.deps
  );
  assert.equal(r.status, 200);
});

test("manual: validates the new options", async () => {
  const m = manualDeps({ documentIds: [], duplicates: [] });
  for (const [extra, error] of [
    [{ forbiddenTokens: "jesse" }, /forbiddenTokens/],
    [{ forbiddenTokens: [1] }, /forbiddenTokens/],
    [{ sanitize: "yes" }, /sanitize must be a boolean/],
    [{ ensureFolder: 1 }, /ensureFolder must be a boolean/],
  ] as const) {
    const r = await handleManualInbound(request({ token: "ams-abc", raw: rawEnotify(), ...extra }), { secret: SECRET, origin: "x" }, m.deps);
    assert.equal(r.status, 400);
    assert.match(String(r.body.error), error);
  }
});

test("manual: dry run shows the sanitized preview and content duplicates", async () => {
  const db = schoolDb();
  const p = pipelineDeps(db, { documentIds: [], duplicates: [] }, { body: MATCH, attachments: [] });
  const r = await handleManualInbound(
    request({ token: "ams-abc", raw: rawEnotify(), dryRun: true }),
    { secret: SECRET, origin: "x" },
    { process: processInboundEmail, processDeps: p.d, folders: async () => assert.fail("no folders") }
  );
  assert.equal(r.body.status, "dry_run");
  assert.equal(r.body.outcome, "duplicate");
  assert.equal(r.body.sanitized, true);
  assert.match(String(r.body.text_preview), /Curriculum Night is this Thursday/);
  assert.doesNotMatch(String(r.body.text_preview), /parent\.person/);
  assert.equal((r.body.contentDuplicates as unknown[]).length, 1);
  assert.equal(db.writes.length, 0);
});
