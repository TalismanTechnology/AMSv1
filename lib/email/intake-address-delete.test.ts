import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  deleteIntakeAddressCore,
  getIntakeAddressDeleteInfoCore,
  setIntakeAddressEnabledCore,
  updateIntakeAddressCore,
  type IntakeAdminDeps,
} from "./intake-address-admin";
import { ensureInboundAddresses } from "./addresses";
import { applyAddressRules, type InboundAddress } from "./inbound";
import {
  processInboundEmail,
  type ProcessInboundDeps,
  type ProcessInboundParams,
} from "./process-inbound";

// Deleting intake addresses (migration 053): a soft delete that turns mail
// away and never touches documents, the document count the dialog shows,
// and email_ingestions.intake_address_ids, which that count reads.

const SCHOOL = "school-1";
const OTHER_SCHOOL = "school-2";
const LIST_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DIVISION_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SCHOOL_ADDR_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

type Row = Record<string, unknown>;
interface Op {
  table: string;
  action: "select" | "insert" | "update" | "delete";
  payload?: Row;
  filters: [string, string, unknown][];
}

/** An in-memory slice of the database the admin core reads and writes. */
function fakeDb(seed: { addresses?: Row[]; ingestions?: Row[]; documents?: Row[] } = {}) {
  const tables: Record<string, Row[]> = {
    email_ingestion_addresses: (seed.addresses ?? []).map((r) => ({ ...r })),
    email_ingestions: seed.ingestions ?? [],
    documents: seed.documents ?? [],
  };
  const ops: Op[] = [];
  const matches = (row: Row, [kind, col, v]: [string, string, unknown]) => {
    if (kind === "eq") return row[col] === v;
    if (kind === "is") return (row[col] ?? null) === v;
    if (kind === "in") return (v as unknown[]).includes(row[col]);
    if (kind === "contains") return (v as unknown[]).every((x) => ((row[col] as unknown[]) ?? []).includes(x));
    return true;
  };
  const run = (op: Op, mode: "many" | "one", range?: [number, number]) => {
    const rows = tables[op.table].filter((r) => op.filters.every((f) => matches(r, f)));
    if (op.action === "update") rows.forEach((r) => Object.assign(r, op.payload));
    if (op.action === "insert") {
      const row = { id: OTHER_ID, created_at: "now", ...op.payload };
      tables[op.table].push(row);
      return { data: row, error: null };
    }
    const picked = range ? rows.slice(range[0], range[1] + 1) : rows;
    return { data: mode === "one" ? picked[0] ?? null : picked, error: null };
  };
  const db = {
    from(table: string) {
      const op: Op = { table, action: "select", filters: [] };
      ops.push(op);
      let range: [number, number] | undefined;
      let mode: "many" | "one" = "many";
      const b: Record<string, unknown> = {
        select: () => b,
        insert: (p: Row) => ((op.action = "insert"), (op.payload = p), b),
        update: (p: Row) => ((op.action = "update"), (op.payload = p), b),
        eq: (c: string, v: unknown) => (op.filters.push(["eq", c, v]), b),
        is: (c: string, v: unknown) => (op.filters.push(["is", c, v]), b),
        in: (c: string, v: unknown) => (op.filters.push(["in", c, v]), b),
        contains: (c: string, v: unknown) => (op.filters.push(["contains", c, v]), b),
        order: () => b,
        range: (from: number, to: number) => ((range = [from, to]), b),
        single: () => ((mode = "one"), b),
        maybeSingle: () => ((mode = "one"), b),
        then: (res: (r: unknown) => unknown) => Promise.resolve(run(op, mode, range)).then(res),
      };
      return b;
    },
  };
  return { db, ops, tables };
}

function deps(db: unknown) {
  const audits: { action: string; id: string; details: unknown; schoolId: string }[] = [];
  const d: IntakeAdminDeps = {
    db: () => db as never,
    requireAdmin: async () => ({ userId: "admin-1" }),
    audit: (_user, action, id, details, schoolId) => audits.push({ action, id, details, schoolId }),
  };
  return { d, audits };
}

const listRow: Row = {
  id: LIST_ID,
  school_id: SCHOOL,
  token: "ams-grade5",
  kind: "list",
  division_id: null,
  label: "Grade 5",
  enabled: true,
  visible_grades: ["5"],
  deleted_at: null,
};
const divisionRow: Row = {
  id: DIVISION_ID,
  school_id: SCHOOL,
  token: "ams-middle",
  kind: "division",
  division_id: "div-middle",
  label: null,
  enabled: true,
  visible_grades: null,
  deleted_at: null,
};
const schoolRow: Row = {
  id: SCHOOL_ADDR_ID,
  school_id: SCHOOL,
  token: "ams-school",
  kind: "school",
  division_id: null,
  enabled: true,
  deleted_at: null,
};

const ingestions: Row[] = [
  // Two emails through Grade 5; doc-2 also came in again later; doc-gone was deleted.
  { school_id: SCHOOL, status: "accepted", intake_address_ids: [LIST_ID], document_ids: ["doc-1", "doc-2"] },
  { school_id: SCHOOL, status: "accepted", intake_address_ids: [LIST_ID, DIVISION_ID], document_ids: ["doc-2", "doc-3", "doc-gone"] },
  // Not counted: not accepted, another address, no record, another school.
  { school_id: SCHOOL, status: "error", intake_address_ids: [LIST_ID], document_ids: ["doc-4"] },
  { school_id: SCHOOL, status: "accepted", intake_address_ids: [DIVISION_ID], document_ids: ["doc-5"] },
  { school_id: SCHOOL, status: "accepted", intake_address_ids: null, document_ids: ["doc-6"] },
  { school_id: OTHER_SCHOOL, status: "accepted", intake_address_ids: [LIST_ID], document_ids: ["doc-7"] },
];
const documents: Row[] = ["doc-1", "doc-2", "doc-3", "doc-4", "doc-5", "doc-6"]
  .map((id) => ({ id, school_id: SCHOOL }))
  .concat({ id: "doc-7", school_id: OTHER_SCHOOL });

// ── The delete dialog's count ───────────────────────────────────────

test("delete info: distinct documents of accepted mail through the address that still exist", async () => {
  const { db } = fakeDb({ addresses: [listRow, divisionRow], ingestions, documents });
  const { d } = deps(db);
  assert.deepEqual(await getIntakeAddressDeleteInfoCore(d, SCHOOL, LIST_ID), { documentCount: 3 });
  assert.deepEqual(await getIntakeAddressDeleteInfoCore(d, SCHOOL, DIVISION_ID), { documentCount: 3 });
});

test("delete info: 0 when nothing is recorded; refused for the whole-school, other-school or bad ids", async () => {
  const { db } = fakeDb({ addresses: [listRow, schoolRow], ingestions: [], documents });
  const { d } = deps(db);
  assert.deepEqual(await getIntakeAddressDeleteInfoCore(d, SCHOOL, LIST_ID), { documentCount: 0 });
  assert.ok("error" in (await getIntakeAddressDeleteInfoCore(d, SCHOOL, SCHOOL_ADDR_ID)));
  assert.ok("error" in (await getIntakeAddressDeleteInfoCore(d, OTHER_SCHOOL, LIST_ID)));
  assert.ok("error" in (await getIntakeAddressDeleteInfoCore(d, SCHOOL, "nope")));
});

test("delete info: goes through the admin guard first", async () => {
  const { db, ops } = fakeDb({ addresses: [listRow] });
  const d: IntakeAdminDeps = { db: () => db as never, requireAdmin: async () => ({ error: "locked" }) };
  assert.deepEqual(await getIntakeAddressDeleteInfoCore(d, SCHOOL, LIST_ID), { error: "locked" });
  assert.equal(ops.length, 0);
});

test("delete info: reads every page of a long history", async () => {
  const many = Array.from({ length: 2500 }, (_, i) => ({
    school_id: SCHOOL,
    status: "accepted",
    intake_address_ids: [LIST_ID],
    document_ids: [`d${i}`],
  }));
  const docs = many.map((_, i) => ({ id: `d${i}`, school_id: SCHOOL }));
  const { db, ops } = fakeDb({ addresses: [listRow], ingestions: many, documents: docs });
  assert.deepEqual(await getIntakeAddressDeleteInfoCore(deps(db).d, SCHOOL, LIST_ID), { documentCount: 2500 });
  assert.equal(ops.filter((o) => o.table === "email_ingestions").length, 3);
});

// ── Deleting ────────────────────────────────────────────────────────

for (const row of [listRow, divisionRow]) {
  test(`delete: soft-deletes a ${row.kind} address, switches it off, and touches no document`, async () => {
    const { db, ops, tables } = fakeDb({ addresses: [row], ingestions, documents });
    const { d, audits } = deps(db);
    assert.deepEqual(await deleteIntakeAddressCore(d, SCHOOL, row.id as string), { success: true });

    const update = ops.find((o) => o.action === "update")!;
    assert.equal(update.table, "email_ingestion_addresses");
    assert.deepEqual(update.filters, [
      ["eq", "id", row.id],
      ["eq", "school_id", SCHOOL],
      ["is", "deleted_at", null],
    ]);
    assert.equal(update.payload!.enabled, false);
    assert.equal(update.payload!.deleted_by, "admin-1");
    assert.equal(typeof update.payload!.deleted_at, "string");
    // The row stays (keeping its slot); nothing else is written.
    assert.equal(tables.email_ingestion_addresses.length, 1);
    assert.deepEqual(
      ops.filter((o) => o.action !== "select").map((o) => o.table),
      ["email_ingestion_addresses"]
    );
    assert.ok(ops.every((o) => o.table !== "documents" || o.action === "select"));

    assert.equal(audits.length, 1);
    assert.equal(audits[0].action, "delete_intake_address");
    assert.equal(audits[0].schoolId, SCHOOL);
    assert.deepEqual(audits[0].details, {
      token: row.token,
      label: row.label,
      kind: row.kind,
      visible_grades: row.visible_grades,
      document_count: 3,
    });
  });
}

test("delete: the whole-school address can only be switched off", async () => {
  const { db, ops } = fakeDb({ addresses: [schoolRow] });
  const { d, audits } = deps(db);
  const r = await deleteIntakeAddressCore(d, SCHOOL, SCHOOL_ADDR_ID);
  assert.ok("error" in r && /Switch it off/.test(r.error));
  assert.equal(ops.filter((o) => o.action !== "select").length, 0);
  assert.equal(audits.length, 0);
});

test("delete: another school's address, a bad id, or an already deleted one is not found", async () => {
  const { db, ops } = fakeDb({ addresses: [listRow, { ...divisionRow, deleted_at: "2026-11-01", enabled: false }] });
  const { d } = deps(db);
  assert.deepEqual(await deleteIntakeAddressCore(d, OTHER_SCHOOL, LIST_ID), { error: "Address not found." });
  assert.deepEqual(await deleteIntakeAddressCore(d, SCHOOL, "nope"), { error: "Address not found." });
  assert.deepEqual(await deleteIntakeAddressCore(d, SCHOOL, DIVISION_ID), { error: "Address not found." });
  assert.equal(ops.filter((o) => o.action !== "select").length, 0);
});

test("a deleted address can't be edited or switched back on", async () => {
  const { db, tables } = fakeDb({ addresses: [listRow] });
  const { d } = deps(db);
  assert.deepEqual(await deleteIntakeAddressCore(d, SCHOOL, LIST_ID), { success: true });
  assert.deepEqual(await setIntakeAddressEnabledCore(d, SCHOOL, LIST_ID, true), { error: "Address not found." });
  assert.deepEqual(await updateIntakeAddressCore(d, SCHOOL, LIST_ID, { label: "Back" }), { error: "Address not found." });
  assert.equal(tables.email_ingestion_addresses[0].enabled, false);
  assert.equal(tables.email_ingestion_addresses[0].label, "Grade 5");
});

test("the server actions wire the delete info through the shared admin guard", () => {
  const source = readFileSync(path.resolve(__dirname, "../../actions/intake-addresses.ts"), "utf8");
  assert.match(source, /requireAdmin: requireSchoolAdmin/);
  assert.match(source, /export async function getIntakeAddressDeleteInfo\([\s\S]*?getIntakeAddressDeleteInfoCore\(deps,/);
});

// ── Routing mail to a deleted address ───────────────────────────────

const inbound = (over: Partial<InboundAddress> = {}): InboundAddress => ({
  id: "addr-g5",
  token: "ams-grade5",
  school_id: SCHOOL,
  division_id: null,
  kind: "list",
  label: "Grade 5",
  enabled: false,
  visible_grades: ["5"],
  deleted_at: "2026-11-01T00:00:00Z",
  ...over,
});

test("applyAddressRules: a deleted address alone is rejected, never falling back", () => {
  const decision = applyAddressRules([inbound()], "office@school.org");
  assert.deepEqual(decision, {
    accepted: false,
    status: "rejected_disabled",
    reason: "Address deleted: Grade 5",
  });
  // Even if something left it switched on.
  const on = applyAddressRules([inbound({ enabled: true })], "office@school.org");
  assert.equal(on.accepted, false);
});

test("applyAddressRules: deleted and switched-off together name both", () => {
  const decision = applyAddressRules(
    [inbound(), inbound({ id: "off", token: "ams-off", label: "Grade 6", deleted_at: null })],
    "a@b.org"
  );
  assert.equal(!decision.accepted && decision.reason, "Address deleted: Grade 5; Address switched off: Grade 6");
});

test("applyAddressRules: with another live address, that address decides", () => {
  const live = inbound({ id: "addr-g6", token: "ams-grade6", label: "Grade 6", enabled: true, deleted_at: null, visible_grades: ["6"] });
  const decision = applyAddressRules([inbound({ enabled: true }), live], "a@b.org");
  assert.equal(decision.accepted, true);
  assert.deepEqual(decision.accepted && decision.addresses, [live]);
  assert.deepEqual(decision.accepted && decision.visibleGrades, ["6"]);
});

// ── ensureInboundAddresses keeps a deleted division address deleted ──

test("ensureInboundAddresses doesn't recreate a deleted division address, and doesn't list it", async () => {
  const inserts: Row[] = [];
  const divisions = [
    { id: "div-lower", name: "Lower School", sort_order: 0 },
    { id: "div-middle", name: "Middle School", sort_order: 1 },
  ];
  const addresses = [
    { id: "s", token: "ams-s", kind: "school", division_id: null, enabled: true, created_at: "1" },
    { id: "l", token: "ams-l", kind: "division", division_id: "div-lower", enabled: true, created_at: "2" },
    { id: "m", token: "ams-m", kind: "division", division_id: "div-middle", enabled: false, created_at: "3", deleted_at: "2026-11-01" },
  ];
  const supabase = {
    from(table: string) {
      const b: Record<string, unknown> = {
        select: () => b,
        eq: () => b,
        order: () => b,
        returns: () => b,
        insert: (row: Row) => (inserts.push(row), b),
        then: (res: (r: unknown) => unknown) =>
          Promise.resolve({
            data: table === "event_calendars" ? divisions : addresses,
            error: null,
          }).then(res),
      };
      return b;
    },
  };
  const result = await ensureInboundAddresses(supabase as never, SCHOOL);
  assert.deepEqual(inserts, []);
  assert.deepEqual(result.addresses.map((a) => a.id), ["s", "l"]);
  assert.deepEqual(result.divisionAddresses.map((a) => a.divisionId), ["div-lower"]);
});

// ── process-inbound records which addresses took the mail ───────────

interface PipelineOp {
  table: string;
  action: string;
  payload?: Row;
  columns?: string;
}

function pipeline(
  rows: InboundAddress[],
  opts: { messageId?: string | null; holder?: Row; missingColumn?: string } = {}
) {
  const ops: PipelineOp[] = [];
  const handler = (op: PipelineOp) => {
    if (op.table === "email_ingestion_addresses") {
      if (opts.missingColumn && op.columns?.includes(opts.missingColumn)) {
        return { data: null, error: { code: "42703", message: `column ${opts.missingColumn} does not exist` } };
      }
      return { data: rows, error: null };
    }
    if (op.table === "schools") return { data: { id: SCHOOL, email_ingestion_enabled: true }, error: null };
    if (op.action === "insert") {
      const status = op.payload!.status as string;
      if (status === "processing" && opts.holder) return { data: null, error: { code: "23505", message: "dup" } };
      return { data: { id: `row-${status}` }, error: null };
    }
    return { data: opts.holder ?? null, error: null };
  };
  const db = {
    from(table: string) {
      const op: PipelineOp = { table, action: "select" };
      ops.push(op);
      const b = {
        select: (columns?: string) => ((op.columns ??= columns), b),
        insert: (p: Row) => ((op.action = "insert"), (op.payload = p), b),
        update: (p: Row) => ((op.action = "update"), (op.payload = p), b),
        eq: () => b,
        in: () => b,
        single: () => b,
        maybeSingle: () => b,
        then: (res: (r: unknown) => unknown) => Promise.resolve().then(() => handler(op)).then(res),
      };
      return b;
    },
  };
  const ingested: Parameters<ProcessInboundDeps["ingest"]>[0][] = [];
  const deps: ProcessInboundDeps = {
    db: () => db as never,
    ingest: async (p) => {
      ingested.push(p);
      return { documentIds: ["doc-1"], duplicates: [] };
    },
    addDivisions: async () => {},
    findDuplicates: async () => assert.fail("not expected"),
    widenVisibility: async () => {},
  };
  const params: ProcessInboundParams = {
    routing: { recipients: rows.map((r) => `${r.token}@in.test`), inboundDomain: "in.test" },
    meta: {
      emailId: null,
      messageId: opts.messageId === undefined ? "<m1@school.org>" : opts.messageId,
      from: "office@school.org",
      subject: "News",
    },
    loadContent: async () => assert.fail("content not expected"),
    origin: "https://example.test",
  };
  return { ops, ingested, result: processInboundEmail(params, deps) };
}

const live = (id: string, over: Partial<InboundAddress> = {}) =>
  inbound({ id, token: `ams-${id}`, label: id, enabled: true, deleted_at: null, visible_grades: null, ...over });

const writes = (ops: PipelineOp[]) => ops.filter((o) => o.table === "email_ingestions" && o.action !== "select");

test("process-inbound: the claim is settled with the addresses that took the mail", async () => {
  const { ops, result } = pipeline([live("g6", { visible_grades: ["6"] }), inbound(), live("g7", { visible_grades: ["7"] })]);
  assert.equal((await result).status, "accepted");
  const [claim, settle] = writes(ops);
  assert.equal(claim.payload!.status, "processing");
  assert.equal("intake_address_ids" in claim.payload!, false);
  assert.equal(settle.action, "update");
  assert.equal(settle.payload!.status, "accepted");
  assert.deepEqual(settle.payload!.intake_address_ids, ["g6", "g7"]);
});

test("process-inbound: without a message id the logged row records the addresses", async () => {
  const { ops, result } = pipeline([live("g6")], { messageId: null });
  assert.equal((await result).status, "accepted");
  const [row] = writes(ops);
  assert.equal(row.action, "insert");
  assert.equal(row.payload!.status, "accepted");
  assert.deepEqual(row.payload!.intake_address_ids, ["g6"]);
});

test("process-inbound: mail only to a deleted address is rejected and records no address", async () => {
  const { ops, ingested, result } = pipeline([inbound()]);
  const r = await result;
  assert.equal(r.status, "rejected_disabled");
  assert.match(r.reason, /^Address deleted: Grade 5/);
  assert.equal(ingested.length, 0);
  const [row] = writes(ops);
  assert.equal(row.payload!.status, "rejected_disabled");
  assert.equal("intake_address_ids" in row.payload!, false);
});

test("process-inbound: the address lookup reads deleted_at", async () => {
  const { ops, result } = pipeline([live("g6")]);
  await result;
  assert.match(ops.find((o) => o.table === "email_ingestion_addresses")!.columns!, /deleted_at/);
});

test("process-inbound: before 053, the lookup still keeps the 051 settings", async () => {
  const { ops, ingested, result } = pipeline([live("g6", { enabled: false })], { missingColumn: "deleted_at" });
  assert.equal((await result).status, "rejected_disabled");
  assert.equal(ingested.length, 0);
  const lookups = ops.filter((o) => o.table === "email_ingestion_addresses");
  assert.equal(lookups.length, 2);
  assert.match(lookups[1].columns!, /enabled/);
});

test("process-inbound: a later copy through another address adds it to the accepted row", async () => {
  const { ops, result } = pipeline([live("g6", { visible_grades: ["6"] })], {
    holder: {
      id: "row-1",
      status: "accepted",
      created_at: new Date().toISOString(),
      document_ids: ["doc-1"],
      intake_address_ids: ["g5"],
    },
  });
  assert.equal((await result).status, "duplicate");
  const update = writes(ops).find((o) => o.action === "update")!;
  assert.deepEqual(update.payload, { intake_address_ids: ["g5", "g6"] });
});
