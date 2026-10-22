import { test } from "node:test";
import assert from "node:assert/strict";
import type { InboundContent } from "./inbound-content";
import {
  bodyHash,
  bodyOverlap,
  findContentDuplicates,
  matchAttachment,
  matchBody,
  normalizeTitle,
  subjectKey,
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
    for (const name of ["select", "eq", "in", "is", "neq", "ilike", "gte", "lte", "or", "limit", "order", "range", "single", "maybeSingle"]) {
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

// Two weekly digests: the calendar section (most of the lines) carries over
// from week to week, the news at the top is new.
const CALENDAR = [
  "Upcoming Events",
  "Mon Oct 27 - Varsity Soccer vs. St. Christopher's, 4:30 PM, Main Field",
  "Tue Oct 28 - Middle School Picture Retakes, 8:00 AM, Gym",
  "Wed Oct 29 - Upper School Parent Coffee, 8:15 AM, Library",
  "Thu Oct 30 - Fall Play Opening Night, 7:00 PM, Oates Theater",
  "Fri Oct 31 - Halloween Parade, Lower School, 2:00 PM",
  "Sat Nov 1 - SAT Testing, 7:45 AM, Upper School",
  "Mon Nov 3 - Board of Trustees Meeting, 6:00 PM",
  "Tue Nov 4 - Election Day, No Classes",
  "Thu Nov 6 - Lower School Book Fair, all day, Commons",
  "Fri Nov 7 - Grandparents Day, 9:00 AM",
];
const digest = (news: string[], calendarLines: string[]) =>
  [
    "View this email in your browser: https://collegiate.myenotice.com/v/abc",
    ...news,
    ...calendarLines,
    "You are receiving this because you are on the Parents list. Unsubscribe: https://x.example/u/1",
  ].join("\n");
const OCT15 = digest(
  [
    "Weekly Digest - October 15",
    "Homecoming recap: thanks to the 400 families who joined us on the Quad for the bonfire.",
    "Flu shot clinic sign-ups close Friday; forms are in the nurse's office.",
    "The robotics team placed second at regionals and heads to state in December.",
    "Reminder that Upper School exam schedules are posted on the portal.",
  ],
  CALENDAR.slice(0, 8)
);
const OCT22 = digest(
  [
    "Weekly Digest - October 22",
    "Fall conferences are next week; book a slot with each advisor by Monday.",
    "Lost and found will be donated on November 1, so check the bins by the gym.",
    "Congratulations to the cross country team on the conference title.",
  ],
  CALENDAR.slice(2)
);
const OCT15_DOC = doc({
  id: "oct15",
  title: "Weekly Digest - October 15",
  email_meta: { subject: "Weekly Digest - October 15", date: "2026-10-15T12:00:00Z" },
});

test("subjectKey keeps prefixes; normalizeTitle drops Re:/Fwd: and extensions", () => {
  assert.equal(subjectKey("  Weekly Digest — October 22! "), "weekly digest october 22");
  assert.notEqual(subjectKey("Reminder: Curriculum Night"), subjectKey("Curriculum Night"));
  assert.notEqual(subjectKey("Fwd: Curriculum Night"), subjectKey("Curriculum Night"));
  assert.equal(normalizeTitle("Fwd: Curriculum Night — Schedule.pdf"), "curriculum night schedule");
  assert.equal(normalizeTitle("RE: Bus_Update.docx"), "bus update");
  assert.equal(normalizeTitle(null), "");
});

test("bodyHash ignores case, spacing, URLs, addresses and unsubscribe/view-online lines", () => {
  const a = "View online: https://x.myenotice.com/v/1\nCurriculum Night is THIS Thursday at 6:30.\nSent to parent.person@gmail.com\nUnsubscribe";
  const b = "Curriculum night is this  Thursday at 6:30!\n\nhttps://collegiate.org/calendar";
  assert.equal(bodyHash(a), bodyHash(b));
  assert.notEqual(bodyHash(a), bodyHash("Curriculum Night is this Friday at 6:30."));
  assert.equal(bodyHash("hi"), null, "too short to compare");
});

test("regression: Weekly Digest Oct 22 is not a duplicate of Oct 15 despite the shared calendar", () => {
  const { jaccard, containment } = bodyOverlap(OCT22, OCT15);
  assert.ok(jaccard < 0.9 && containment < 0.95, `overlap ${jaccard} / ${containment}`);
  assert.ok(containment > 0.3, "the fixtures really do share most of the calendar");
  assert.equal(
    matchBody([{ doc: OCT15_DOC, text: OCT15 }], {
      subject: "Weekly Digest - October 22",
      date: "2026-10-22T12:00:00Z",
      text: OCT22,
    }),
    null
  );
});

test("an exact resend under a new Message-ID (other subject line, other day) is a duplicate", () => {
  const resent = OCT15.replace("https://collegiate.myenotice.com/v/abc", "https://collegiate.myenotice.com/v/zzz");
  assert.deepEqual(
    matchBody([{ doc: OCT15_DOC, text: OCT15 }], { subject: "Fwd: Weekly Digest", date: "2026-10-20T08:00:00Z", text: resent }),
    { documentId: "oct15", title: "Weekly Digest - October 15", why: "same body text" }
  );
  // A stored hash is used without the text.
  const hashed = doc({ ...OCT15_DOC, email_meta: { ...OCT15_DOC.email_meta, body_hash_v1: bodyHash(OCT15) } });
  assert.equal(matchBody([{ doc: hashed, text: null }], { subject: "x", date: null, text: OCT15 })?.documentId, "oct15");
});

test('"Reminder: X" with different text is not a duplicate of "X", even on the same day', () => {
  const x = doc({ id: "x", title: "Curriculum Night", email_meta: { subject: "Curriculum Night", date: "2026-10-19T09:00:00Z" } });
  const original = "Curriculum Night is Thursday at 6:30 in the theater. Meet your child's teachers and hear about the year.";
  const reminder = "Don't forget: Curriculum Night is tonight. Parking is in the North lot; the theater doors open at 6.";
  assert.equal(
    matchBody([{ doc: x, text: original }], { subject: "Reminder: Curriculum Night", date: "2026-10-19T15:00:00Z", text: reminder }),
    null
  );
});

test("same subject: >= 0.9 overlap or the same day is a duplicate; otherwise new", () => {
  const prior = doc({ id: "w1", title: "Weekly Update", email_meta: { subject: "Weekly Update", date: "2026-10-12T12:00:00Z" } });
  const near = OCT15 + "\nP.S. Picture day photos are online.";
  const hit = matchBody([{ doc: prior, text: OCT15 }], { subject: "weekly update", date: "2026-10-19T12:00:00Z", text: near });
  assert.equal(hit?.documentId, "w1");
  assert.match(hit!.why, /^same subject, \d+% same text$/);

  // A recurring subject with new content on another day is new.
  assert.equal(matchBody([{ doc: prior, text: OCT15 }], { subject: "Weekly Update", date: "2026-10-19T12:00:00Z", text: OCT22 }), null);
  // Same subject and same day (e.g. the Gmail copy and the native copy, reformatted).
  assert.equal(
    matchBody([{ doc: prior, text: null }], { subject: "Weekly Update", date: "2026-10-12T18:00:00Z", text: OCT22 })?.why,
    "same subject and date"
  );
  // An undated message can't be matched on the date alone.
  assert.equal(matchBody([{ doc: prior, text: null }], { subject: "Weekly Update", date: null, text: OCT22 }), null);
});

/** FakeDb with a storage bucket of path -> contents. */
function dbWithFiles(handler: (op: Op) => Reply, files: Record<string, string>) {
  const db = new FakeDb(handler) as FakeDb & { storage: unknown; downloads: string[] };
  db.downloads = [];
  db.storage = {
    from: () => ({
      download: async (path: string) => {
        db.downloads.push(path);
        const f = files[path];
        return f === undefined ? { data: null, error: { message: "not found" } } : { data: new Blob([f]), error: null };
      },
    }),
  };
  return db;
}

const att = (filename: string, bytes: string, disposition = "attachment") => ({
  filename,
  contentType: "application/pdf",
  disposition,
  load: async () => Buffer.from(bytes),
});

test("findContentDuplicates: bounded email candidates, stored text compared, digests kept apart", async () => {
  const oct15 = { ...OCT15_DOC, file_url: "s1/email/oct15.txt", created_at: "2026-10-15T12:05:00Z" };
  const db = dbWithFiles((op) => (op.table === "documents" ? ok([oct15]) : ok([])), { "s1/email/oct15.txt": OCT15 });

  const found = await findContentDuplicates(
    { schoolId: "s1", subject: "Weekly Digest - October 22", content: content({ subject: "Weekly Digest - October 22", date: "2026-10-22T12:00:00Z", text: OCT22 }) },
    db as never
  );
  assert.equal(found.body, null);
  const queries = db.ops.filter((o) => o.table === "documents");
  assert.equal(queries.length, 3);
  for (const q of queries) {
    assert.deepEqual(q.calls.filter((c) => c[0] === "eq"), [["eq", "school_id", "s1"], ["eq", "source", "email"]]);
    assert.ok(arg(q, "limit"));
  }
  assert.deepEqual(arg(queries[0], "gte"), ["gte", "created_at", "2026-08-23T12:00:00.000Z"]);
  assert.deepEqual(arg(queries[2], "ilike"), ["ilike", "email_meta->>subject", "%weekly%digest%october%22%"]);
  assert.deepEqual(db.downloads, ["s1/email/oct15.txt"]);

  const again = await findContentDuplicates(
    { schoolId: "s1", subject: "Weekly Digest - October 15", content: content({ subject: "Weekly Digest - October 15", date: "2026-10-15T12:00:00Z", text: OCT15 }) },
    db as never
  );
  assert.equal(again.body?.documentId, "oct15");
});

test("attachments: duplicate only with the same name AND the same bytes", async () => {
  const slip = doc({ id: "slip", title: "Permission Slip", file_name: "Permission_Slip.pdf", file_url: "s1/email/slip.pdf" });
  const db = dbWithFiles((op) => (op.table === "documents" ? ok(arg(op, "or") ? [slip] : []) : ok([])), {
    "s1/email/slip.pdf": "%PDF same bytes",
  });
  const found = await findContentDuplicates(
    {
      schoolId: "s1",
      subject: "Field trip",
      content: content({
        text: null,
        attachments: [att("Permission Slip.pdf", "%PDF same bytes"), att("logo.png", "x", "inline"), att("permission_slip.PDF", "%PDF new version")],
      }),
    },
    db as never
  );
  assert.deepEqual(
    found.attachments.map((a) => [a.filename, a.match?.documentId ?? null, a.match?.why ?? null]),
    [["Permission Slip.pdf", "slip", "same file name and content"], ["permission_slip.PDF", null, null]]
  );
  assert.equal(String(arg(db.ops[0], "or")?.[1]), "title.ilike.%permission%slip%,file_name.ilike.%permission%slip%");

  // Same bytes under another name is not matched by name, and isn't looked up.
  const other = dbWithFiles(() => ok([]), {});
  assert.equal((await matchAttachment(other as never, "s1", att("Other.pdf", "%PDF same bytes"))), null);
  assert.equal(other.downloads.length, 0);
});

test("findContentDuplicates fails on an unreadable document list; an unreadable stored text is no match", async () => {
  const failing = dbWithFiles(() => ({ data: null, error: { message: "timeout" } }), {});
  await assert.rejects(
    findContentDuplicates({ schoolId: "s1", subject: "x", content: content({ text: OCT15 }) }, failing as never),
    /Duplicate check failed: timeout/
  );
  const missing = dbWithFiles(
    (op) => ok(op.table === "documents" ? [{ ...OCT15_DOC, file_url: "gone.txt" }] : []),
    {}
  );
  const found = await findContentDuplicates(
    { schoolId: "s1", subject: "x", content: content({ subject: "Something else", date: "2026-10-16T00:00:00Z", text: OCT15 }) },
    missing as never
  );
  assert.equal(found.body, null);
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

test("webhook: a native copy of content already added adds its divisions to the matched docs", async () => {
  const db = new FakeDb((op) => {
    if (op.table === "email_ingestion_addresses") return ok([{ token: "ams-ls", school_id: "s1", division_id: "lower" }]);
    if (op.table === "schools") return ok({ id: "s1", email_ingestion_enabled: true, allowed_sender_domains: ["collegiateschool.org"] });
    if (op.action === "insert") return ok({ id: "row-processing" });
    return ok(null);
  });
  const added: [string[], string[]][] = [];
  const { d, calls } = pipelineDeps(db, { documentIds: [], duplicates: [{ part: "body", match: MATCH }] });
  d.addDivisions = async (docs, divs) => void added.push([docs, divs]);
  const r = await processInboundEmail(
    params({
      routing: { recipients: ["ams-ls@in.example"], inboundDomain: "in.example" },
      meta: { emailId: "re_1", messageId: "<native@x>", from: "office@collegiateschool.org", subject: "Curriculum Night" },
      onReview: "hold",
      reasonSuffix: undefined,
    }),
    d
  );
  assert.equal(calls[0].dedupe, true);
  assert.equal(calls[0].processInline, undefined, "the webhook keeps the HTTP trigger");
  assert.equal(r.status, "duplicate");
  assert.equal(r.httpStatus, 200);
  assert.deepEqual(added, [[["old-1"], ["lower"]]]);

  // A failure to tag answers 500 so Resend retries.
  d.addDivisions = async () => {
    throw new Error("db down");
  };
  const failed = await processInboundEmail(
    params({ routing: { recipients: ["ams-ls@in.example"], inboundDomain: "in.example" }, onReview: "hold" }),
    d
  );
  assert.equal(failed.httpStatus, 500);
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
  assert.equal(ingest.processInline, true, "processed here, no PROCESS_DOCUMENT_SECRET needed");
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
