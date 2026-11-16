import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  createIntakeAddressCore,
  deleteIntakeAddressCore,
  setIntakeAddressEnabledCore,
  updateIntakeAddressCore,
  type IntakeAdminDeps,
} from "./intake-address-admin";
import { normalizeAllowedSenders, normalizeLabel, validateIntakeAddressInput } from "./intake-address-config";

const SCHOOL = "school-1";
const ADDRESS_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FOLDER_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";

type Row = Record<string, unknown>;
interface Op {
  table: string;
  action: "select" | "insert" | "update" | "delete";
  payload?: Row;
  filters: [string, unknown][];
}

function fakeDb(opts: { address?: Row | null; folder?: Row | null; insertErrors?: { code: string; message: string }[] } = {}) {
  const ops: Op[] = [];
  const insertErrors = [...(opts.insertErrors ?? [])];
  const reply = (op: Op) => {
    if (op.table === "folders") return { data: opts.folder ?? null, error: null };
    if (op.action === "insert") {
      const err = insertErrors.shift();
      return err ? { data: null, error: err } : { data: { id: ADDRESS_ID, created_at: "now", ...op.payload }, error: null };
    }
    if (op.action === "update") return { data: { ...(opts.address ?? {}), ...op.payload }, error: null };
    if (op.action === "delete") return { data: null, error: null };
    return { data: opts.address ?? null, error: null };
  };
  const db = {
    from(table: string) {
      const op: Op = { table, action: "select", filters: [] };
      ops.push(op);
      const b: Record<string, unknown> = {
        select: () => b,
        insert: (p: Row) => ((op.action = "insert"), (op.payload = p), b),
        update: (p: Row) => ((op.action = "update"), (op.payload = p), b),
        delete: () => ((op.action = "delete"), b),
        eq: (c: string, v: unknown) => (op.filters.push([c, v]), b),
        single: () => b,
        maybeSingle: () => b,
        then: (res: (r: unknown) => unknown) => Promise.resolve(reply(op)).then(res),
      };
      return b;
    },
  };
  return { db, ops };
}

function deps(db: unknown, admin: boolean | "locked" = true) {
  const guarded: string[] = [];
  const d: IntakeAdminDeps = {
    db: () => db as never,
    requireAdmin: async (schoolId) => {
      guarded.push(schoolId);
      if (admin === "locked") return { error: "This school is locked by its owner." };
      return admin ? { userId: "admin-1" } : { error: "You do not have permission to manage this school" };
    },
    newToken: () => "ams-newtoken01",
  };
  return { d, guarded };
}

const listRow = { id: ADDRESS_ID, token: "ams-list", kind: "list", division_id: null, label: "Grade 9", enabled: true, visible_grades: ["9"] };
const schoolRow = { id: ADDRESS_ID, token: "ams-e8d87e5b8c44", kind: "school", division_id: null, enabled: true };

test("create: adds a list address with a generated token and validated settings", async () => {
  const { db, ops } = fakeDb({ folder: { id: FOLDER_ID } });
  const { d, guarded } = deps(db);
  const r = await createIntakeAddressCore(d, SCHOOL, {
    label: "  Middle School   parents ",
    visibleGrades: ["8", "6", "7"],
    allowedSenders: "Office@School.org\nschool.org",
    defaultFolderId: FOLDER_ID,
  });
  assert.ok("address" in r, JSON.stringify(r));
  assert.deepEqual(guarded, [SCHOOL]);
  const insert = ops.find((o) => o.action === "insert")!;
  assert.equal(insert.payload!.kind, "list");
  assert.equal(insert.payload!.school_id, SCHOOL);
  assert.equal(insert.payload!.token, "ams-newtoken01");
  assert.equal(insert.payload!.label, "Middle School parents");
  assert.deepEqual(insert.payload!.visible_grades, ["6", "7", "8"]);
  assert.deepEqual(insert.payload!.allowed_senders, ["office@school.org", "school.org"]);
  assert.equal(r.address.visibleGrades?.join(","), "6,7,8");
});

test("create: a label is required and grades are validated", async () => {
  const { db, ops } = fakeDb();
  const { d } = deps(db);
  assert.ok("error" in (await createIntakeAddressCore(d, SCHOOL, { label: " " })));
  assert.ok("error" in (await createIntakeAddressCore(d, SCHOOL, { label: "X", visibleGrades: ["13"] })));
  assert.ok("error" in (await createIntakeAddressCore(d, SCHOOL, { label: "X", allowedSenders: "not an address" })));
  assert.equal(ops.filter((o) => o.action === "insert").length, 0);
});

test("create: a folder from another school is refused", async () => {
  const { db, ops } = fakeDb({ folder: null });
  const { d } = deps(db);
  const r = await createIntakeAddressCore(d, SCHOOL, { label: "X", defaultFolderId: FOLDER_ID });
  assert.ok("error" in r);
  assert.equal(ops.filter((o) => o.action === "insert").length, 0);
});

test("create: a token clash retries with a new token", async () => {
  const { db, ops } = fakeDb({ insertErrors: [{ code: "23505", message: "dup" }] });
  const { d } = deps(db);
  const r = await createIntakeAddressCore(d, SCHOOL, { label: "X" });
  assert.ok("address" in r);
  assert.equal(ops.filter((o) => o.action === "insert").length, 2);
});

test("every action goes through the admin guard (and so the owner lock) first", async () => {
  for (const admin of [false, "locked"] as const) {
    const { db, ops } = fakeDb({ address: listRow });
    const { d } = deps(db, admin);
    for (const r of [
      await createIntakeAddressCore(d, SCHOOL, { label: "X" }),
      await updateIntakeAddressCore(d, SCHOOL, ADDRESS_ID, { label: "Y" }),
      await setIntakeAddressEnabledCore(d, SCHOOL, ADDRESS_ID, false),
      await deleteIntakeAddressCore(d, SCHOOL, ADDRESS_ID),
    ]) {
      assert.ok("error" in r);
    }
    assert.equal(ops.length, 0, "no query before the guard passes");
  }
});

test("rename / change visibility updates only this school's address", async () => {
  const { db, ops } = fakeDb({ address: listRow });
  const { d } = deps(db);
  const r = await updateIntakeAddressCore(d, SCHOOL, ADDRESS_ID, { label: "Grade 10", visibleGrades: ["10"] });
  assert.ok("address" in r);
  const update = ops.find((o) => o.action === "update")!;
  assert.deepEqual(update.filters, [["id", ADDRESS_ID], ["school_id", SCHOOL]]);
  assert.deepEqual(update.payload!.visible_grades, ["10"]);
});

test("system addresses may go unnamed; list addresses may not", async () => {
  const sys = fakeDb({ address: schoolRow });
  assert.ok("address" in (await updateIntakeAddressCore(deps(sys.db).d, SCHOOL, ADDRESS_ID, { label: "" })));
  const list = fakeDb({ address: listRow });
  assert.ok("error" in (await updateIntakeAddressCore(deps(list.db).d, SCHOOL, ADDRESS_ID, { label: "" })));
});

test("disable / enable", async () => {
  const { db, ops } = fakeDb({ address: listRow });
  const r = await setIntakeAddressEnabledCore(deps(db).d, SCHOOL, ADDRESS_ID, false);
  assert.ok("address" in r && r.address.enabled === false);
  assert.equal(ops.find((o) => o.action === "update")!.payload!.enabled, false);
});

test("delete: list addresses only; the whole-school address can't be deleted", async () => {
  const list = fakeDb({ address: listRow });
  assert.deepEqual(await deleteIntakeAddressCore(deps(list.db).d, SCHOOL, ADDRESS_ID), { success: true });
  assert.deepEqual(list.ops.find((o) => o.action === "delete")!.filters, [["id", ADDRESS_ID], ["school_id", SCHOOL]]);

  const sys = fakeDb({ address: schoolRow });
  const r = await deleteIntakeAddressCore(deps(sys.db).d, SCHOOL, ADDRESS_ID);
  assert.ok("error" in r);
  assert.equal(sys.ops.filter((o) => o.action === "delete").length, 0);
});

test("an id that isn't a uuid, or from another school, is not found", async () => {
  const { db } = fakeDb({ address: null });
  assert.ok("error" in (await deleteIntakeAddressCore(deps(db).d, SCHOOL, "nope")));
  assert.ok("error" in (await deleteIntakeAddressCore(deps(db).d, SCHOOL, ADDRESS_ID)));
});

test("config helpers", () => {
  assert.deepEqual(normalizeLabel("", false), { label: null });
  assert.ok("error" in normalizeLabel("x".repeat(81), true));
  assert.deepEqual(normalizeAllowedSenders(""), { senders: null });
  assert.deepEqual(normalizeAllowedSenders(["@PTA.org", "pta.org"]), { senders: ["@pta.org", "pta.org"] });
  assert.ok("error" in validateIntakeAddressInput({ label: "x", defaultFolderId: "../etc" }, { labelRequired: true }));
});

test("the server actions use the shared admin guard", () => {
  const source = readFileSync(path.resolve(__dirname, "../../actions/intake-addresses.ts"), "utf8");
  assert.match(source, /requireAdmin: requireSchoolAdmin/);
  const docs = readFileSync(path.resolve(__dirname, "../../actions/documents.ts"), "utf8");
  const body = docs.slice(docs.indexOf("export async function setDocumentVisibleGrades("));
  assert.match(body, /requireSchoolAdmin\(schoolId\)/);
  assert.match(body, /normalizeVisibleGrades\(grades\)/);
});
