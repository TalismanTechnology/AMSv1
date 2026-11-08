import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The Xcode target is still called "App", so any name key left as
// $(PRODUCT_NAME) / $(TARGET_NAME) shows "App" to users (the Mac Dock and
// menu bar read CFBundleName for the iPad app running on a Mac).
const plist = readFileSync(join(process.cwd(), "ios/App/App/Info.plist"), "utf8")
  .replace(/<!--[\s\S]*?-->/g, "");

function plistString(key: string): string | undefined {
  const match = plist.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`));
  return match?.[1];
}

test("iOS display and bundle names are AskMySchool, not the target name", () => {
  assert.equal(plistString("CFBundleDisplayName"), "AskMySchool");
  assert.equal(plistString("CFBundleName"), "AskMySchool");
});

test("iOS bundle id and executable still come from the build settings", () => {
  assert.equal(plistString("CFBundleIdentifier"), "$(PRODUCT_BUNDLE_IDENTIFIER)");
  assert.equal(plistString("CFBundleExecutable"), "$(EXECUTABLE_NAME)");
});
