import { test } from "node:test";
import assert from "node:assert/strict";
import { deepLinkPath, opensInAppBrowser } from "./links";
import { appleAppSiteAssociation, appleTeamId, TEAM_ID_PLACEHOLDER } from "./app-links";

const ORIGIN = "https://askmyschool.app";

test("external http(s) links open in the in-app browser", () => {
  assert.equal(opensInAppBrowser("https://www.blackbaud.com/help", ORIGIN), true);
  assert.equal(opensInAppBrowser("http://example.org/lunch.pdf", ORIGIN), true);
  assert.equal(
    opensInAppBrowser("https://abc.supabase.co/storage/v1/object/sign/doc.pdf", ORIGIN),
    true
  );
});

test("same-site, relative and non-web links stay put", () => {
  assert.equal(opensInAppBrowser("/s/demo/parent/chat", ORIGIN), false);
  assert.equal(opensInAppBrowser("https://askmyschool.app/privacy", ORIGIN), false);
  // From a local dev server, production links still count as the app's own.
  assert.equal(opensInAppBrowser("https://askmyschool.app/terms", "http://localhost:3000"), false);
  assert.equal(opensInAppBrowser("mailto:office@school.org", ORIGIN), false);
  assert.equal(opensInAppBrowser("tel:+15555550100", ORIGIN), false);
  assert.equal(opensInAppBrowser("javascript:alert(1)", ORIGIN), false);
  // Local dev server: its own origin is in-app too.
  assert.equal(opensInAppBrowser("http://localhost:3000/login", "http://localhost:3000"), false);
});

test("universal links map to their in-app path", () => {
  assert.equal(
    deepLinkPath("https://askmyschool.app/s/demo/parent/announcements#announcement-42"),
    "/s/demo/parent/announcements#announcement-42"
  );
  assert.equal(deepLinkPath("https://askmyschool.app/s/demo/parent?tab=x"), "/s/demo/parent?tab=x");
});

test("custom-scheme links map to their in-app path", () => {
  assert.equal(
    deepLinkPath("app.askmyschool://open?path=%2Fs%2Fdemo%2Fparent%2Fchat"),
    "/s/demo/parent/chat"
  );
});

test("sign-in callbacks, API routes and foreign links are not deep links", () => {
  assert.equal(deepLinkPath("app.askmyschool://auth-callback?code=abc"), null);
  assert.equal(deepLinkPath("https://askmyschool.app/auth/blackbaud/callback?code=x"), null);
  assert.equal(deepLinkPath("https://askmyschool.app/api/push/devices"), null);
  assert.equal(deepLinkPath("app.askmyschool://open?path=//evil.example"), null);
  assert.equal(deepLinkPath("app.askmyschool://open?path=https://evil.example"), null);
  assert.equal(deepLinkPath("app.askmyschool://open?path=/auth/app-handoff"), null);
  assert.equal(deepLinkPath("https://evil.example/s/demo/parent"), null);
  assert.equal(deepLinkPath("not a url"), null);
});

test("the AASA file uses the Team ID when it looks real, the placeholder otherwise", () => {
  assert.equal(appleTeamId("ab12cd34ef"), "AB12CD34EF");
  assert.equal(appleTeamId(undefined), TEAM_ID_PLACEHOLDER);
  assert.equal(appleTeamId("not-a-team"), TEAM_ID_PLACEHOLDER);

  const file = appleAppSiteAssociation("AB12CD34EF");
  assert.deepEqual(file.applinks.details[0].appIDs, ["AB12CD34EF.app.askmyschool"]);
  assert.deepEqual(file.webcredentials.apps, ["AB12CD34EF.app.askmyschool"]);
  const components = file.applinks.details[0].components;
  // Exclusions come before the parent-area matches, since the first match wins.
  const firstInclude = components.findIndex((c) => !("exclude" in c));
  assert.ok(components.slice(0, firstInclude).some((c) => c["/"] === "/auth/*"));
});
