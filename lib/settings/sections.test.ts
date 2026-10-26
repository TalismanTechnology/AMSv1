import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  CONTENT_PAGES,
  CONTENT_PAGE_INFO,
  SETTINGS_SECTIONS,
  SETTINGS_SECTION_INFO,
  SETTING_ENTRIES,
  isSettingsSection,
  legacySettingsHashTarget,
  legacySettingsRedirect,
  resolveSectionAlias,
  settingsHref,
} from "./sections";

const ROOT = path.join(__dirname, "../..");
const ADMIN_DIR = path.join(ROOT, "app/s/[slug]/(dashboard)/admin");
const SETTINGS_DIR = path.join(ADMIN_DIR, "settings");

test("every section has a label, description and its own page", () => {
  for (const section of SETTINGS_SECTIONS) {
    assert.ok(SETTINGS_SECTION_INFO[section].label);
    assert.ok(SETTINGS_SECTION_INFO[section].description);
    assert.ok(
      statSync(path.join(SETTINGS_DIR, section, "page.tsx")).isFile(),
      `missing page for ${section}`
    );
  }
  assert.equal(Object.keys(SETTINGS_SECTION_INFO).length, SETTINGS_SECTIONS.length);
});

test("Email intake and Contacts are their own admin pages, not Settings sections", () => {
  for (const page of CONTENT_PAGES) {
    const info = CONTENT_PAGE_INFO[page];
    assert.ok(info.label && info.description);
    assert.ok(statSync(path.join(ADMIN_DIR, info.path, "page.tsx")).isFile(), `missing page for ${page}`);
    assert.equal(isSettingsSection(page), false);
  }
  // The old section pages are gone, so /settings/email and /settings/contacts
  // fall through to the [alias] redirect.
  for (const old of ["email", "contacts"]) {
    assert.equal(existsSync(path.join(SETTINGS_DIR, old)), false, `settings/${old} still exists`);
  }
  assert.equal(settingsHref("demo", "email-intake"), "/s/demo/admin/email-intake");
  assert.equal(settingsHref("demo", "contacts"), "/s/demo/admin/contacts");
  assert.equal(
    settingsHref("demo", "contacts", "setting-suggested-contacts"),
    "/s/demo/admin/contacts#setting-suggested-contacts"
  );
});

test("isSettingsSection accepts known sections only", () => {
  assert.equal(isSettingsSection("sign-in"), true);
  assert.equal(isSettingsSection("general"), false);
  assert.equal(isSettingsSection(""), false);
  assert.equal(isSettingsSection(null), false);
});

test("setting anchors are unique and exist as ids in the UI", () => {
  const anchors = SETTING_ENTRIES.map((e) => e.anchor);
  assert.equal(new Set(anchors).size, anchors.length);

  const sources: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (full.endsWith(".tsx")) sources.push(readFileSync(full, "utf8"));
    }
  };
  walk(path.join(ROOT, "components/admin"));
  const all = sources.join("\n");
  for (const anchor of anchors) {
    assert.match(all, new RegExp(`id="${anchor}"`), `no element with id ${anchor}`);
  }
});

test("settingsHref builds landing, section and anchor URLs", () => {
  assert.equal(settingsHref("demo"), "/s/demo/admin/settings");
  assert.equal(settingsHref("demo", "website"), "/s/demo/admin/settings/website");
  assert.equal(
    settingsHref("demo", "sign-in", "setting-roster-gate"),
    "/s/demo/admin/settings/sign-in#setting-roster-gate"
  );
  assert.equal(
    settingsHref("demo", "email-intake", "setting-auto-sort"),
    "/s/demo/admin/email-intake#setting-auto-sort"
  );
});

test("old ?tab= links redirect to the matching section", () => {
  const expected: Record<string, string> = {
    general: "settings/school",
    assistant: "settings/assistant",
    contacts: "contacts",
    email: "email-intake",
    website: "settings/website",
    "sign-in": "settings/sign-in",
    blackbaud: "settings/blackbaud",
  };
  for (const [tab, target] of Object.entries(expected)) {
    assert.equal(legacySettingsRedirect("demo", { tab }), `/s/demo/admin/${target}`);
  }
});

test("Blackbaud's OAuth return lands on the Blackbaud page with its result", () => {
  assert.equal(
    legacySettingsRedirect("demo", { blackbaud: "connected" }),
    "/s/demo/admin/settings/blackbaud?blackbaud=connected"
  );
  // Even if an old ?tab= was left on the URL.
  assert.equal(
    legacySettingsRedirect("demo", { tab: "general", blackbaud: "denied" }),
    "/s/demo/admin/settings/blackbaud?blackbaud=denied"
  );
});

test("other query params survive the redirect; no tab means no redirect", () => {
  assert.equal(
    legacySettingsRedirect("demo", { tab: "email", foo: "1" }),
    "/s/demo/admin/email-intake?foo=1"
  );
  assert.equal(legacySettingsRedirect("demo", {}), null);
  assert.equal(legacySettingsRedirect("demo", { foo: "1" }), null);
  assert.equal(legacySettingsRedirect("demo", { tab: "nope" }), null);
});

test("old #hash links resolve to the new page and anchor", () => {
  assert.equal(legacySettingsHashTarget("demo", "#email"), "/s/demo/admin/email-intake");
  assert.equal(legacySettingsHashTarget("demo", "#contacts"), "/s/demo/admin/contacts");
  assert.equal(
    legacySettingsHashTarget("demo", "#setting-staff-contacts"),
    "/s/demo/admin/contacts#setting-staff-contacts"
  );
  assert.equal(
    legacySettingsHashTarget("demo", "#email-ingestion-enabled"),
    "/s/demo/admin/email-intake#setting-email-ingestion"
  );
  assert.equal(legacySettingsHashTarget("demo", "#general"), "/s/demo/admin/settings/school");
  assert.equal(
    legacySettingsHashTarget("demo", "#auto-sort"),
    "/s/demo/admin/email-intake#setting-auto-sort"
  );
  assert.equal(
    legacySettingsHashTarget("demo", "#school-name"),
    "/s/demo/admin/settings/school#setting-school-name"
  );
  assert.equal(
    legacySettingsHashTarget("demo", "#setting-roster-gate"),
    "/s/demo/admin/settings/sign-in#setting-roster-gate"
  );
  // The removed school Contact information field points at staff contacts.
  assert.equal(
    legacySettingsHashTarget("demo", "#contact-info"),
    "/s/demo/admin/contacts#setting-staff-contacts"
  );
  assert.equal(
    legacySettingsHashTarget("demo", "#setting-contact-info"),
    "/s/demo/admin/contacts#setting-staff-contacts"
  );
  assert.equal(legacySettingsHashTarget("demo", "#nope"), null);
  assert.equal(legacySettingsHashTarget("demo", ""), null);
});

test("section aliases", () => {
  assert.equal(resolveSectionAlias("general"), "school");
  assert.equal(resolveSectionAlias("ai"), "assistant");
  assert.equal(resolveSectionAlias("Roster"), "sign-in");
  // The old /settings/email and /settings/contacts pages, and their other names.
  assert.equal(resolveSectionAlias("email"), "email-intake");
  assert.equal(resolveSectionAlias("email-ingestion"), "email-intake");
  assert.equal(resolveSectionAlias("intake"), "email-intake");
  assert.equal(resolveSectionAlias("contacts"), "contacts");
  assert.equal(resolveSectionAlias("staff-contacts"), "contacts");
  assert.equal(resolveSectionAlias("nope"), null);
});
