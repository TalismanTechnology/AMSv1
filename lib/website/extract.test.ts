import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPage } from "./extract";

const site = { origin: "https://www.example.org" };

const PAGE = `<!doctype html>
<html>
<head>
  <title>Admissions | Example School</title>
  <link rel="canonical" href="https://example.org/admissions/?utm_source=x">
  <style>.hero { color: red }</style>
  <script>window.track = function () { console.log("SCRIPT TEXT") }</script>
</head>
<body>
  <header><a href="/">Home</a> <a href="/login">Parent login</a></header>
  <nav class="menu">
    <ul>
      <li><a href="/about">About Us NAVLINK</a></li>
      <li><a href="/athletics#teams">Athletics</a></li>
      <li><a href="https://other.example.com/x">Elsewhere</a></li>
      <li><a href="/private" rel="nofollow">Private</a></li>
    </ul>
  </nav>
  <div id="cookie-banner">We use cookies COOKIETEXT</div>
  <main>
    <h1>Admissions</h1>
    <p>Applications for the 2026–27 school year open on September 1. Families
       should submit the online form together with the most recent report card.</p>
    <h2>Tuition</h2>
    <p>Tuition for Lower School is $24,500. Financial aid is available for
       qualifying families; the deadline to apply is January 15.</p>
    <ul>
      <li>Campus tours run every Tuesday at 9am.</li>
      <li>Shadow days are available for grades 5–12.</li>
    </ul>
  </main>
  <footer>© 2026 Example School FOOTERTEXT · 123 Main St</footer>
  <noscript>NOSCRIPTTEXT</noscript>
</body>
</html>`;

test("keeps the main text and drops nav, footer, script, style and cookie banners", () => {
  const page = extractPage(PAGE, "https://www.example.org/admissions", site);

  assert.match(page.text, /Applications for the 2026–27 school year open on September 1/);
  assert.match(page.text, /Tuition for Lower School is \$24,500/);
  assert.match(page.text, /Campus tours run every Tuesday/);

  for (const leaked of ["SCRIPT TEXT", "NAVLINK", "FOOTERTEXT", "COOKIETEXT", "NOSCRIPTTEXT", "color: red"]) {
    assert.ok(!page.text.includes(leaked), `text should not contain ${leaked}`);
  }
});

test("keeps paragraph and list structure as separate lines", () => {
  const page = extractPage(PAGE, "https://www.example.org/admissions", site);
  const lines = page.text.split("\n");
  assert.ok(lines.some((l) => l.startsWith("- Campus tours")));
  assert.ok(lines.some((l) => l.trim() === "Tuition"));
});

test("takes the title from the document head", () => {
  const page = extractPage(PAGE, "https://www.example.org/admissions", site);
  assert.equal(page.title, "Admissions | Example School");
});

test("falls back to the h1 when there is no <title>", () => {
  const page = extractPage(
    "<html><body><main><h1>Bus Routes</h1><p>Route 4 leaves at 7:10.</p></main></body></html>",
    "https://www.example.org/bus",
    site
  );
  assert.equal(page.title, "Bus Routes");
});

test("resolves rel=canonical onto the site's canonical host", () => {
  const page = extractPage(PAGE, "https://www.example.org/admissions", site);
  assert.equal(page.canonicalUrl, "https://www.example.org/admissions");
});

test("collects same-site links (nav included), skipping off-site and nofollow", () => {
  const page = extractPage(PAGE, "https://www.example.org/admissions", site);
  assert.ok(page.links.includes("https://www.example.org/about"));
  assert.ok(page.links.includes("https://www.example.org/athletics"));
  assert.ok(!page.links.some((l) => l.includes("other.example.com")));
  assert.ok(!page.links.includes("https://www.example.org/private"));
});

test("reads meta robots noindex / nofollow", () => {
  const page = extractPage(
    `<html><head><meta name="robots" content="noindex, nofollow"></head>
     <body><main><p>Hidden</p><a href="/a">A</a></main></body></html>`,
    "https://www.example.org/x",
    site
  );
  assert.equal(page.noindex, true);
  assert.equal(page.nofollow, true);
  assert.deepEqual(page.links, []);
});

test("short pages keep their text even when Readability finds little", () => {
  const page = extractPage(
    `<html><head><title>Contact</title></head><body>
       <nav><a href="/">Home</a></nav>
       <div class="content"><p>Front office: (555) 123-4567</p><p>Open 7:30am–4pm.</p></div>
       <footer>Footer stuff</footer></body></html>`,
    "https://www.example.org/contact",
    site
  );
  assert.match(page.text, /Front office: \(555\) 123-4567/);
  assert.match(page.text, /Open 7:30am–4pm/);
  assert.ok(!page.text.includes("Footer stuff"));
});
