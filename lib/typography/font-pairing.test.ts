import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function read(relPath: string): string {
  return readFileSync(path.join(ROOT, relPath), "utf8");
}

describe("Yeseva One + Josefin Sans site & app typography pairing", () => {
  it("loads Josefin_Sans and Yeseva_One on <html> in app/layout.tsx without Inter", () => {
    const layout = read("app/layout.tsx");
    assert.match(layout, /Josefin_Sans/);
    assert.match(layout, /Yeseva_One/);
    assert.doesNotMatch(layout, /\bInter\b/);
    assert.match(layout, /--font-josefin-sans/);
    assert.match(layout, /--font-yeseva-one/);
    assert.match(
      layout,
      /<html[^>]*className=\{`\$\{josefinSans\.variable\} \$\{yesevaOne\.variable\}`\}/
    );
  });

  it("maps --font-sans to Josefin Sans and --font-serif + headings to Yeseva One in globals.css", () => {
    const css = read("app/globals.css");
    assert.match(css, /--font-sans:\s*var\(--font-josefin-sans\)/);
    assert.match(css, /--font-serif:\s*var\(--font-yeseva-one\)/);
    assert.doesNotMatch(css, /--font-inter/);
    // Ensure .font-serif-display is no longer forced back to --font-sans
    assert.doesNotMatch(
      css,
      /\.font-serif-display[\s\S]{0,160}font-family:\s*var\(--font-sans\)/
    );
    assert.match(css, /h1:not\(\.sr-only\):not\(\.font-sans\)/);
    assert.match(css, /h2:not\(\.sr-only\):not\(\.font-sans\)/);
  });

  it("removes Instrument_Serif from the landing hero in favor of Yeseva One", () => {
    const hero = read("components/landing/video-hero.tsx");
    assert.doesNotMatch(hero, /Instrument_Serif/);
    assert.match(hero, /id="landing-heading"[\s\S]{0,120}font-serif-display/);
  });

  it("bundles valid TrueType fonts for offline pages and /wall.png Satori rendering", () => {
    const fontFiles = [
      "public/fonts/YesevaOne-Regular.ttf",
      "public/fonts/JosefinSans-Regular.ttf",
      "public/fonts/JosefinSans-SemiBold.ttf",
      "public/fonts/JosefinSans-Bold.ttf",
      "mobile/www/fonts/YesevaOne-Regular.ttf",
      "mobile/www/fonts/JosefinSans-Regular.ttf",
      "mobile/www/fonts/JosefinSans-SemiBold.ttf",
    ];
    for (const rel of fontFiles) {
      const full = path.join(ROOT, rel);
      assert.ok(existsSync(full), `Expected ${rel} to exist`);
      const buf = readFileSync(full);
      assert.ok(buf.byteLength > 10_000, `Expected ${rel} to be non-empty TTF`);
      assert.equal(buf.readUInt32BE(0), 0x00010000, `Expected TrueType header on ${rel}`);
    }

    for (const rel of [
      "public/offline.html",
      "mobile/www/index.html",
      "app/wall.png/route.tsx",
      "components/wall/wall-image.tsx",
      "components/chat/chat-export.tsx",
    ]) {
      const content = read(rel);
      assert.match(content, /Yeseva One/, `Expected Yeseva One in ${rel}`);
      assert.match(content, /Josefin Sans/, `Expected Josefin Sans in ${rel}`);
      assert.doesNotMatch(content, /Liberation Sans|Helvetica Neue|\bInter\b/);
    }
  });
});
