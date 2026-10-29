import { test } from "node:test";
import assert from "node:assert/strict";
import { statSync } from "node:fs";
import path from "node:path";
import {
  ADMIN_NAV,
  activeNavChild,
  adminRelativePath,
  isNavItemActive,
  type AdminNavItem,
} from "./nav";

const ADMIN_DIR = path.join(__dirname, "../../app/s/[slug]/(dashboard)/admin");
const items = ADMIN_NAV.flatMap((g) => g.items);
const item = (key: string) => items.find((i) => i.key === key) as AdminNavItem;
const q = (s = "") => new URLSearchParams(s);

test("every sidebar link points at an existing admin page", () => {
  for (const it of items) {
    for (const p of [it.path, ...(it.children ?? []).map((c) => c.path)]) {
      assert.ok(statSync(path.join(ADMIN_DIR, p, "page.tsx")).isFile(), `no page for ${p}`);
    }
  }
});

test("nav keys are unique", () => {
  const keys = items.flatMap((i) => [i.key, ...(i.children ?? []).map((c) => c.key)]);
  assert.equal(new Set(keys).size, keys.length);
});

test("adminRelativePath strips the admin base", () => {
  assert.equal(adminRelativePath("/s/demo/admin", "/s/demo/admin"), "");
  assert.equal(adminRelativePath("/s/demo/admin/", "/s/demo/admin"), "");
  assert.equal(adminRelativePath("/s/demo/admin/events/blackbaud", "/s/demo/admin"), "/events/blackbaud");
});

test("dashboard is active only on the dashboard", () => {
  assert.equal(isNavItemActive(item("dashboard"), ""), true);
  assert.equal(isNavItemActive(item("dashboard"), "/documents"), false);
});

test("sections stay active on their sub-pages", () => {
  assert.equal(isNavItemActive(item("settings"), "/settings/sign-in"), true);
  assert.equal(isNavItemActive(item("events"), "/events"), true);
  assert.equal(isNavItemActive(item("documents"), "/document-audit"), false);
});

test("the active sub-item follows the path and ?view=", () => {
  assert.equal(activeNavChild(item("documents"), "/documents", q())?.key, "documents-list");
  assert.equal(activeNavChild(item("documents"), "/documents", q("view=map"))?.key, "documents-map");
  assert.equal(activeNavChild(item("settings"), "/settings/sign-in", q())?.key, "settings-sign-in");
  // The landing page belongs to Settings but to none of its sections.
  assert.equal(activeNavChild(item("settings"), "/settings", q()), null);
});

test("Email intake and Contacts are top-level Content items, not Settings children", () => {
  const content = ADMIN_NAV.find((g) => g.key === "content")!;
  assert.deepEqual(
    content.items.map((i) => i.label),
    ["Documents", "Events", "Email intake", "Contacts"]
  );
  assert.equal(item("email-intake").path, "/email-intake");
  assert.equal(item("contacts").path, "/contacts");
  const settingsChildren = (item("settings").children ?? []).map((c) => c.path);
  assert.ok(!settingsChildren.includes("/settings/email"));
  assert.ok(!settingsChildren.includes("/settings/contacts"));
  assert.equal(isNavItemActive(item("contacts"), "/contacts"), true);
  assert.equal(isNavItemActive(item("settings"), "/contacts"), false);
});

test("Insights is merged into Analytics under Parents", () => {
  const parents = ADMIN_NAV.find((g) => g.key === "parents")!;
  assert.deepEqual(
    parents.items.map((i) => i.label),
    ["Analytics", "Feedback", "Users"]
  );
  assert.equal(items.some((i) => i.key === "insights" || i.path === "/insights"), false);
  for (const word of ["topics", "trends", "questions", "insights"]) {
    assert.ok(item("analytics").keywords?.includes(word), word);
  }
  // The old route still exists, as a redirect to Analytics.
  assert.ok(statSync(path.join(ADMIN_DIR, "insights", "page.tsx")).isFile());
});
