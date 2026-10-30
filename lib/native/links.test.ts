import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SYSTEM_BROWSER_ATTRIBUTE,
  SYSTEM_BROWSER_LINK,
  deepLinkPath,
  opensInAppBrowser,
} from "./links";
import { APPLE_TEAM_ID, appleAppSiteAssociation, appleTeamId } from "./app-links";

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

test("links marked for the system browser skip the in-app browser", () => {
  // native-shell.tsx passes anchor.hasAttribute(SYSTEM_BROWSER_ATTRIBUTE).
  assert.deepEqual(Object.keys(SYSTEM_BROWSER_LINK), [SYSTEM_BROWSER_ATTRIBUTE]);
  assert.equal(SYSTEM_BROWSER_ATTRIBUTE.startsWith("data-"), true);
  const google = "https://www.google.com/search?q=lunch%20menu";
  assert.equal(opensInAppBrowser(google, ORIGIN), true);
  assert.equal(opensInAppBrowser(google, ORIGIN, true), false);
});

test("universal links map to their in-app path", () => {
  assert.equal(
    deepLinkPath("https://askmyschool.app/s/demo/parent/events#event-42"),
    "/s/demo/parent/events#event-42"
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

test("the AASA file uses the env Team ID when it looks real, the app's Team ID otherwise", () => {
  assert.equal(APPLE_TEAM_ID, "DCVUJWG3YP");
  assert.equal(appleTeamId("ab12cd34ef"), "AB12CD34EF");
  assert.equal(appleTeamId(undefined), "DCVUJWG3YP");
  assert.equal(appleTeamId(""), "DCVUJWG3YP");
  assert.equal(appleTeamId("not-a-team"), "DCVUJWG3YP");

  const file = appleAppSiteAssociation(appleTeamId(undefined));
  assert.deepEqual(file.applinks.details[0].appIDs, ["DCVUJWG3YP.app.askmyschool"]);
  assert.deepEqual(file.webcredentials.apps, ["DCVUJWG3YP.app.askmyschool"]);
  const components = file.applinks.details[0].components;
  // Exclusions come before the parent-area matches, since the first match wins.
  const firstInclude = components.findIndex((c) => !("exclude" in c));
  assert.ok(components.slice(0, firstInclude).some((c) => c["/"] === "/auth/*"));
});
