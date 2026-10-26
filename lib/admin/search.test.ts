import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { buildAdminSearchIndex, canAccess, searchAdmin } from "./search";
import { ADMIN_NAV } from "./nav";
import { SETTINGS_SECTIONS, SETTING_ENTRIES } from "@/lib/settings/sections";

const admin = buildAdminSearchIndex("demo", { isSuperAdmin: false });
const superAdmin = buildAdminSearchIndex("demo", { isSuperAdmin: true });
const top = (query: string) => searchAdmin(admin, query)[0]?.id;

test("indexes every admin page, settings section and setting", () => {
  const hrefs = new Set(admin.map((e) => e.href));
  for (const group of ADMIN_NAV) {
    for (const item of group.items) assert.ok(hrefs.has(`/s/demo/admin${item.path}`), item.key);
  }
  for (const section of SETTINGS_SECTIONS) {
    assert.ok(hrefs.has(`/s/demo/admin/settings/${section}`), section);
  }
  for (const setting of SETTING_ENTRIES) {
    const entry = admin.find((e) => e.id === setting.anchor);
    assert.ok(entry, setting.anchor);
    assert.equal(entry.anchor, setting.anchor);
    assert.ok(entry.href.endsWith(`#${setting.anchor}`));
  }
  assert.ok(hrefs.has("/s/demo/admin/documents?view=map"));
  assert.ok(hrefs.has("/s/demo/admin/events/blackbaud"));
});

test("entry ids are unique", () => {
  const ids = superAdmin.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("super-admin-only entries are hidden from school admins", () => {
  assert.equal(canAccess("superAdmin", { isSuperAdmin: false }), false);
  assert.equal(canAccess("admin", { isSuperAdmin: false }), true);
  assert.ok(!admin.some((e) => e.access === "superAdmin"));
  assert.ok(superAdmin.some((e) => e.id === "page-super-admin"));
  assert.equal(searchAdmin(admin, "super admin").length, 0);
});

test("feature anchors exist on their pages", () => {
  const read = (dir: string): string =>
    readdirSync(dir)
      .map((name) => path.join(dir, name))
      .map((full) =>
        statSync(full).isDirectory() ? read(full) : full.endsWith(".tsx") ? readFileSync(full, "utf8") : ""
      )
      .join("\n");
  const src = read(path.join(__dirname, "../../app/s/[slug]/(dashboard)/admin"));
  for (const entry of admin.filter((e) => e.group === "Features" && e.anchor)) {
    assert.match(src, new RegExp(`id="${entry.anchor}"`), entry.anchor);
  }
});

test("finds settings by label and keywords", () => {
  assert.equal(top("auto-sort"), "setting-auto-sort");
  assert.equal(top("grade rollover"), "setting-grade-rollover");
  assert.equal(top("approve all"), "setting-suggested-contacts");
  assert.equal(top("flagged"), "feature-flagged");
  assert.equal(top("auto folder"), "feature-auto-folder");
  assert.equal(top("sorting map"), "page-documents-map");
  assert.equal(top("email intake"), "settings-email");
  assert.equal(top("temp"), "setting-temperature");
  assert.equal(top("conflicts"), "page-conflicts");
});

test("every word must match; empty query lists pages", () => {
  assert.deepEqual(searchAdmin(admin, "zzzz"), []);
  assert.deepEqual(searchAdmin(admin, "roster zzzz"), []);
  const empty = searchAdmin(admin, "  ", 100);
  assert.ok(empty.length > 0);
  assert.ok(empty.every((e) => e.group === "Pages"));
});
