import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The iPad app running on a Mac shows up in the Dock under its wrapper name
// (<PRODUCT_NAME>.app), not CFBundleName. With PRODUCT_NAME = $(TARGET_NAME)
// that was App.app, so the Dock said "App" even though CFBundleName was
// AskMySchool (1.0.1). PRODUCT_NAME is set explicitly instead; `npx cap sync`
// doesn't touch it. The Xcode target and scheme stay "App", which Capacitor
// and fastlane (ios/App/fastlane/Fastfile) look up by name.
const ios = join(process.cwd(), "ios/App");
const plist = readFileSync(join(ios, "App/Info.plist"), "utf8")
  .replace(/<!--[\s\S]*?-->/g, "");
const pbxproj = readFileSync(join(ios, "App.xcodeproj/project.pbxproj"), "utf8");
const scheme = readFileSync(
  join(ios, "App.xcodeproj/xcshareddata/xcschemes/App.xcscheme"),
  "utf8",
);

function plistString(key: string): string | undefined {
  const match = plist.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`));
  return match?.[1];
}

// The Debug and Release build settings of the App target, found through its
// configuration list rather than by object id.
function appTargetConfigs(): Map<string, string> {
  const target = pbxproj.match(
    /\/\* App \*\/ = \{\s*isa = PBXNativeTarget;[\s\S]*?buildConfigurationList = (\w+)[\s\S]*?\n\t\t\};/,
  );
  assert.ok(target, "App native target not found");
  const list = pbxproj.match(
    new RegExp(`\\t${target[1]} /\\*[^*]*\\*/ = \\{[\\s\\S]*?buildConfigurations = \\(([\\s\\S]*?)\\);`),
  );
  assert.ok(list, "App target configuration list not found");
  const configs = new Map<string, string>();
  for (const [, id, name] of list[1].matchAll(/(\w+) \/\* (\w+) \*\//g)) {
    const config = pbxproj.match(
      new RegExp(`\\t${id} /\\* ${name} \\*/ = \\{[\\s\\S]*?buildSettings = \\{([\\s\\S]*?)\\n\\t\\t\\t\\};`),
    );
    assert.ok(config, `${name} configuration not found`);
    configs.set(name, config[1]);
  }
  assert.deepEqual([...configs.keys()].sort(), ["Debug", "Release"]);
  return configs;
}

function setting(settings: string, key: string): string | undefined {
  return settings.match(new RegExp(`\\b${key} = ("[^"]*"|[^;]*);`))?.[1].replace(/^"|"$/g, "");
}

test("iOS display and bundle names are AskMySchool, not the target name", () => {
  assert.equal(plistString("CFBundleDisplayName"), "AskMySchool");
  assert.equal(plistString("CFBundleName"), "AskMySchool");
});

test("iOS bundle id and executable still come from the build settings", () => {
  assert.equal(plistString("CFBundleIdentifier"), "$(PRODUCT_BUNDLE_IDENTIFIER)");
  assert.equal(plistString("CFBundleExecutable"), "$(EXECUTABLE_NAME)");
});

test("App target builds AskMySchool.app, 1.0.2 build 3, as app.askmyschool", () => {
  for (const [name, settings] of appTargetConfigs()) {
    assert.equal(setting(settings, "PRODUCT_NAME"), "AskMySchool", name);
    assert.equal(setting(settings, "MARKETING_VERSION"), "1.0.2", name);
    assert.equal(setting(settings, "CURRENT_PROJECT_VERSION"), "3", name);
    assert.equal(setting(settings, "PRODUCT_BUNDLE_IDENTIFIER"), "app.askmyschool", name);
  }
});

test("the built product and scheme point at AskMySchool.app", () => {
  assert.match(pbxproj, /productReference = \w+ \/\* AskMySchool\.app \*\/;/);
  assert.match(pbxproj, /path = AskMySchool\.app;/);
  assert.doesNotMatch(pbxproj, /\bApp\.app\b/);

  const buildables = [...scheme.matchAll(/BuildableName = "([^"]*)"/g)].map((m) => m[1]);
  assert.ok(buildables.length > 0, "no BuildableName in App.xcscheme");
  for (const name of buildables) assert.equal(name, "AskMySchool.app");
});

test("the Xcode target and scheme are still named App for cap sync and fastlane", () => {
  assert.match(pbxproj, /\/\* App \*\/ = \{\s*isa = PBXNativeTarget;[\s\S]*?\n\t\t\tname = App;/);
  for (const [, name] of scheme.matchAll(/BlueprintName = "([^"]*)"/g)) assert.equal(name, "App");
  assert.match(scheme, /ReferencedContainer = "container:App\.xcodeproj"/);
});
