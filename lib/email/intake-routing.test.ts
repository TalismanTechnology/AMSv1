import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAddressRules, senderAllowed, type InboundAddress } from "./inbound";
import {
  processInboundEmail,
  type ProcessInboundDeps,
  type ProcessInboundParams,
} from "./process-inbound";
import { ingestReceivedEmail } from "./ingest-message";
import { ingestFileAsDocument } from "@/lib/documents/ingest";
import type { InboundContent } from "./inbound-content";

// Mailing-list intake addresses (migration 051): routing by token to the
// address's settings, and those settings landing on the documents.

const SCHOOL = "school-1";

const address = (over: Partial<InboundAddress> = {}): InboundAddress => ({
  id: "addr-1",
  token: "ams-list",
  school_id: SCHOOL,
  division_id: null,
  kind: "list",
  label: "Grade 10 parents",
  enabled: true,
  visible_grades: ["10"],
  allowed_senders: null,
  default_folder_id: null,
  ...over,
});

// ── Pure rules ───────────────────────────────────────────────────────

test("senderAllowed: no rule lets anyone in", () => {
  assert.equal(senderAllowed("anyone@gmail.com", null), true);
  assert.equal(senderAllowed("anyone@gmail.com", []), true);
  assert.equal(senderAllowed(null, null), true);
});

test("senderAllowed: addresses match exactly, domains cover subdomains", () => {
  const rule = ["office@school.org", "district.k12.us", "@pta.org"];
  assert.equal(senderAllowed("OFFICE@school.org", rule), true);
  assert.equal(senderAllowed("teacher@school.org", rule), false);
  assert.equal(senderAllowed("head@district.k12.us", rule), true);
  assert.equal(senderAllowed("head@mail.district.k12.us", rule), true);
  assert.equal(senderAllowed("x@evildistrict.k12.us", rule), false);
  assert.equal(senderAllowed("chair@pta.org", rule), true);
  assert.equal(senderAllowed(null, rule), false);
});

test("applyAddressRules: an address without settings behaves as before", () => {
  const legacy: InboundAddress = { token: "ams-e8d87e5b8c44", school_id: SCHOOL, division_id: null };
  assert.deepEqual(applyAddressRules([legacy], "anyone@x.org"), {
    accepted: true,
    divisionIds: [],
    visibleGrades: null,
    folderId: null,
    addresses: [legacy],
  });
});

test("applyAddressRules: a switched-off address rejects as rejected_disabled", () => {
  const decision = applyAddressRules([address({ enabled: false })], "a@b.org");
  assert.equal(decision.accepted, false);
  assert.equal(!decision.accepted && decision.status, "rejected_disabled");
  assert.match(!decision.accepted ? decision.reason : "", /Grade 10 parents/);
});

test("applyAddressRules: a sender outside the rule rejects as rejected_domain", () => {
  const decision = applyAddressRules([address({ allowed_senders: ["school.org"] })], "x@gmail.com");
  assert.equal(!decision.accepted && decision.status, "rejected_domain");
});

test("applyAddressRules: several addresses widen the audience, first folder wins", () => {
  const decision = applyAddressRules(
    [
      address({ visible_grades: ["10"], default_folder_id: "folder-a" }),
      address({ token: "b", visible_grades: ["9"], default_folder_id: "folder-b" }),
      address({ token: "off", enabled: false, visible_grades: null }),
    ],
    "a@b.org"
  );
  assert.equal(decision.accepted, true);
  assert.deepEqual(decision.accepted && decision.visibleGrades, ["9", "10"]);
  assert.equal(decision.accepted && decision.folderId, "folder-a");
});

test("applyAddressRules: any all-parents address makes it all parents", () => {
  const decision = applyAddressRules(
    [address(), address({ token: "school", kind: "school", visible_grades: null })],
    "a@b.org"
  );
  assert.equal(decision.accepted && decision.visibleGrades, null);
});

// ── processInboundEmail ──────────────────────────────────────────────

type Reply = { data: unknown; error: { code?: string; message: string } | null };
interface Op {
  table: string;
  action: string;
  payload?: unknown;
  columns?: string;
}

function fakeDb(rows: InboundAddress[], holder: unknown = null, claimConflict = false) {
  const ops: Op[] = [];
  const handler = (op: Op): Reply => {
    if (op.table === "email_ingestion_addresses") return { data: rows, error: null };
    if (op.table === "schools") return { data: { id: SCHOOL, email_ingestion_enabled: true }, error: null };
    if (op.table === "email_ingestions") {
      if (op.action === "insert") {
        const status = (op.payload as { status: string }).status;
        if (status === "processing" && claimConflict) {
          return { data: null, error: { code: "23505", message: "dup" } };
        }
        return { data: { id: `row-${status}` }, error: null };
      }
      return { data: holder, error: null };
    }
    throw new Error(`unexpected table ${op.table}`);
  };
  return {
    ops,
    from(table: string) {
      const op: Op = { table, action: "select" };
      ops.push(op);
      const b = {
        select: (columns?: string) => ((op.columns ??= columns), b),
        insert: (p: unknown) => ((op.action = "insert"), (op.payload = p), b),
        update: (p: unknown) => ((op.action = "update"), (op.payload = p), b),
        eq: () => b,
        in: () => b,
        single: () => b,
        maybeSingle: () => b,
        then: (res: (r: Reply) => unknown, rej: (e: unknown) => unknown) =>
          Promise.resolve().then(() => handler(op)).then(res, rej),
      };
      return b;
    },
  };
}

function run(rows: InboundAddress[], from = "Office <office@school.org>", opts: { holder?: unknown; claimConflict?: boolean } = {}) {
  const db = fakeDb(rows, opts.holder, opts.claimConflict);
  const calls = {
    ingest: [] as Parameters<ProcessInboundDeps["ingest"]>[0][],
    widen: [] as [string[], string[] | null][],
  };
  const deps: ProcessInboundDeps = {
    db: () => db as never,
    ingest: async (p) => {
      calls.ingest.push(p);
      return { documentIds: ["doc-1"], duplicates: [] };
    },
    addDivisions: async () => {},
    findDuplicates: async () => assert.fail("not expected"),
    widenVisibility: async (ids, grades) => {
      calls.widen.push([ids, grades]);
    },
  };
  const params: ProcessInboundParams = {
    routing: { token: rows[0]?.token ?? "ams-none" },
    meta: { emailId: null, messageId: "<m1@school.org>", from, subject: "Grade 10 trip" },
    loadContent: async () => assert.fail("content not expected"),
    origin: "https://example.test",
  };
  return { db, calls, result: processInboundEmail(params, deps) };
}

test("a grade-limited address passes its grades and folder to ingest", async () => {
  const { calls, result } = run([address({ default_folder_id: "folder-1" })]);
  const r = await result;
  assert.equal(r.status, "accepted");
  assert.deepEqual(calls.ingest[0].visibleGrades, ["10"]);
  assert.equal(calls.ingest[0].folderId, "folder-1");
  assert.deepEqual(calls.ingest[0].divisionIds, []);
});

test("the address lookup asks for the settings columns", async () => {
  const { db, result } = run([address()]);
  await result;
  const lookup = db.ops.find((o) => o.table === "email_ingestion_addresses");
  assert.match(lookup?.columns ?? "", /visible_grades/);
  assert.match(lookup?.columns ?? "", /allowed_senders/);
});

test("a switched-off address is rejected, logged, and nothing is ingested", async () => {
  const { db, calls, result } = run([address({ enabled: false })]);
  const r = await result;
  assert.equal(r.status, "rejected_disabled");
  assert.equal(calls.ingest.length, 0);
  const logged = db.ops.find((o) => o.table === "email_ingestions" && o.action === "insert");
  assert.equal((logged?.payload as { status: string }).status, "rejected_disabled");
});

test("a sender the address doesn't allow is rejected as rejected_domain", async () => {
  const { calls, result } = run([address({ allowed_senders: ["school.org"] })], "Spam <x@spam.biz>");
  const r = await result;
  assert.equal(r.status, "rejected_domain");
  assert.equal(calls.ingest.length, 0);
});

test("an allowed sender gets through", async () => {
  const { result } = run([address({ allowed_senders: ["school.org"] })], "Office <office@school.org>");
  assert.equal((await result).status, "accepted");
});

test("the whole-school address (no settings yet) ingests for all parents, as before", async () => {
  const { calls, result } = run([{ token: "ams-e8d87e5b8c44", school_id: SCHOOL, division_id: null }]);
  assert.equal((await result).status, "accepted");
  assert.equal(calls.ingest[0].visibleGrades, null);
  assert.equal(calls.ingest[0].folderId, null);
});

test("a later copy to another list widens who can see the first copy", async () => {
  const { calls, result } = run([address({ visible_grades: ["9"] })], undefined, {
    claimConflict: true,
    holder: { id: "row-1", status: "accepted", created_at: new Date().toISOString(), document_ids: ["doc-1"] },
  });
  const r = await result;
  assert.equal(r.status, "duplicate");
  assert.deepEqual(calls.widen, [[["doc-1"], ["9"]]]);
});

test("a restricted copy arriving while the first is still ingesting asks for a retry", async () => {
  const { result } = run([address()], undefined, {
    claimConflict: true,
    holder: { id: "row-1", status: "processing", created_at: new Date().toISOString(), document_ids: [] },
  });
  assert.equal((await result).httpStatus, 409);
});

// ── visible_grades reaches every document of the email ───────────────

test("ingestReceivedEmail copies visible_grades and the folder onto the body and every attachment", async () => {
  delete process.env.PROCESS_DOCUMENT_SECRET;
  const created: Parameters<typeof ingestFileAsDocument>[0][] = [];
  const content: InboundContent = {
    from: "office@school.org",
    to: [],
    cc: [],
    replyTo: [],
    subject: "Trip",
    text: "Grade 10 trip details",
    html: "",
    date: "",
    attachments: [
      { filename: "form.pdf", contentType: "application/pdf", load: async () => Buffer.from("%PDF") },
      { filename: "list.docx", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", load: async () => Buffer.from("x") },
    ],
  } as unknown as InboundContent;
  const { documentIds } = await ingestReceivedEmail({
    schoolId: SCHOOL,
    loadContent: async () => content,
    subject: "Trip",
    fromAddress: "office@school.org",
    divisionIds: [],
    visibleGrades: ["10"],
    folderId: "folder-1",
    origin: "https://example.test",
    createDocument: async (p) => {
      created.push(p);
      return { documentId: `doc-${created.length}` };
    },
  });
  assert.equal(documentIds.length, 3);
  assert.equal(created.length, 3);
  for (const p of created) {
    assert.deepEqual(p.visibleGrades, ["10"]);
    assert.equal(p.folderId, "folder-1");
  }
});

function fakeStorageDb() {
  const inserts: Record<string, unknown>[] = [];
  return {
    inserts,
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
        remove: async () => ({ error: null }),
      }),
    },
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        inserts.push(row);
        return { select: () => ({ single: async () => ({ data: { id: "doc-1" }, error: null }) }) };
      },
    }),
  };
}

test("ingestFileAsDocument stores visible_grades and folder_id when set", async () => {
  const db = fakeStorageDb();
  await ingestFileAsDocument(
    { schoolId: SCHOOL, buffer: Buffer.from("x"), fileName: "a.txt", title: "a", visibleGrades: ["10"], folderId: "f1" },
    db as never
  );
  assert.deepEqual(db.inserts[0].visible_grades, ["10"]);
  assert.equal(db.inserts[0].folder_id, "f1");
});

test("ingestFileAsDocument leaves the insert unchanged for all-parents mail", async () => {
  const db = fakeStorageDb();
  await ingestFileAsDocument({ schoolId: SCHOOL, buffer: Buffer.from("x"), fileName: "a.txt", title: "a" }, db as never);
  assert.equal("visible_grades" in db.inserts[0], false);
  assert.equal("folder_id" in db.inserts[0], false);
});
