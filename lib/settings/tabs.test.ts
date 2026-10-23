import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  SETTINGS_TABS,
  SETTINGS_TAB_LABELS,
  isSettingsTab,
  settingsTabUrl,
} from "./tabs";

test("every settings tab has a label", () => {
  for (const tab of SETTINGS_TABS) assert.ok(SETTINGS_TAB_LABELS[tab]);
  assert.equal(Object.keys(SETTINGS_TAB_LABELS).length, SETTINGS_TABS.length);
});

test("isSettingsTab accepts known tabs only", () => {
  assert.equal(isSettingsTab("sign-in"), true);
  assert.equal(isSettingsTab("blackbaud"), true);
  assert.equal(isSettingsTab("Sign-in"), false);
  assert.equal(isSettingsTab(""), false);
  assert.equal(isSettingsTab(null), false);
  assert.equal(isSettingsTab(undefined), false);
});

test("settingsTabUrl sets ?tab= and drops it for general", () => {
  const base = "https://x.test/s/demo/admin/settings?foo=1";
  assert.equal(settingsTabUrl(base, "email"), "https://x.test/s/demo/admin/settings?foo=1&tab=email");
  assert.equal(
    settingsTabUrl("https://x.test/s/demo/admin/settings?tab=email&foo=1", "general"),
    "https://x.test/s/demo/admin/settings?foo=1"
  );
});

test("settings header renders every tab and does not scroll sideways", () => {
  const src = readFileSync(
    path.join(__dirname, "../../app/s/[slug]/(dashboard)/admin/settings/client.tsx"),
    "utf8"
  );
  const header = src.slice(src.indexOf("<Tabs "), src.indexOf("</TabsList>"));
  assert.ok(header.length > 0, "settings header not found");
  assert.doesNotMatch(header, /overflow-x-(auto|scroll)/);
  assert.match(header, /flex-wrap/);
  // Phones get a dropdown listing all tabs; wider screens get wrapped pills.
  assert.match(header, /SETTINGS_TABS\.map/);
  assert.match(header, /<Select\b/);
});
