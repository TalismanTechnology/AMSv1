import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownRenderer } from "@/components/chat/markdown-renderer";
import {
  completePartialMarkdown,
  decodeHtmlEntities,
  normalizeMarkdown,
  stripMarkdown,
} from "./normalize";
import type { ChatSource } from "@/lib/types";

const SOURCES = [1, 2, 3].map(
  (n) => ({ source_number: n, title: `Doc ${n}` }) as ChatSource
);

function render(content: string, streaming = false): string {
  return renderToStaticMarkup(
    <MarkdownRenderer content={content} sources={SOURCES} skipCitationAnimation streaming={streaming} />
  );
}

/** The visible text of rendered HTML (tags removed, entities decoded). */
function visibleText(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ""));
}

const ANSWER = `Here's what you need to know about **Spirit Week**:

- **Monday:** Pajama Day [1]
- **Tuesday** — *Twin Day*, bring a buddy [1][2]
- Wear your \`house\` colors on **Friday**[2]

**Note:**Students must still follow the [dress code](https://school.example/dress-code) [3].

1. Drop-off begins at **7:45 AM** [1].
2. Questions? Email the office at _office@school.example_.

> **Reminder:** tickets are **$20** [2].

\`\`\`
Gate code: 1234
\`\`\`

All done!`;

test("streaming: no cut point shows literal markers", () => {
  for (let cut = 1; cut <= ANSWER.length; cut++) {
    const partial = ANSWER.slice(0, cut);
    const html = render(partial, true);
    // Code blocks may hold anything; check the prose around them.
    const prose = visibleText(html.replace(/<pre[\s\S]*?<\/pre>/g, ""));
    const where = `cut ${cut}: ${JSON.stringify(partial.slice(-30))} → ${JSON.stringify(prose.slice(-60))}`;
    assert.ok(!prose.includes("**"), `literal ** at ${where}`);
    assert.ok(!/(^|[^\w])\*|\*($|[^\w])/.test(prose.replace(/\d \* \d/g, "")), `literal * at ${where}`);
    assert.ok(!prose.includes("`"), `literal backtick at ${where}`);
    assert.ok(!prose.includes("]("), `raw link at ${where}`);
    assert.ok(!/\[\d*$|\[\d+\]/.test(prose), `raw citation at ${where}`);
    assert.ok(!/(^|\s)_|_(\s|$)/.test(prose), `literal _ at ${where}`);
    assert.ok(!prose.includes("&amp;") && !/&[a-z#]/.test(prose), `raw entity at ${where}`);
  }
});

test("streaming: the full answer renders the same as the final render", () => {
  assert.equal(render(ANSWER, true), render(ANSWER, false));
});

test("streaming: open emphasis and code are closed, empty ones hidden", () => {
  assert.equal(completePartialMarkdown("Hello **Fri"), "Hello **Fri**");
  assert.equal(completePartialMarkdown("Hello **Friday "), "Hello **Friday**");
  assert.equal(completePartialMarkdown("Hello **Friday*"), "Hello **Friday**");
  assert.equal(completePartialMarkdown("Hello **"), "Hello ");
  assert.equal(completePartialMarkdown("Hello *"), "Hello ");
  assert.equal(completePartialMarkdown("Hello*"), "Hello");
  assert.equal(completePartialMarkdown("Hello *wor"), "Hello *wor*");
  assert.equal(completePartialMarkdown("Use `npm"), "Use `npm`");
  assert.equal(completePartialMarkdown("Use `"), "Use ");
  assert.equal(completePartialMarkdown("See _this"), "See _this_");
  assert.equal(completePartialMarkdown("a ~~gone"), "a ~~gone~~");
  assert.equal(completePartialMarkdown("~5 minutes"), "~5 minutes");
  assert.equal(completePartialMarkdown("file_na"), "file_na");
  assert.equal(completePartialMarkdown("5 * 3"), "5 * 3");
  assert.equal(completePartialMarkdown("Read the [dress code](https://sch"), "Read the dress code");
  assert.equal(completePartialMarkdown("Read the [dress co"), "Read the dress co");
  assert.equal(completePartialMarkdown("Pajama Day [1"), "Pajama Day ");
  assert.equal(completePartialMarkdown("Pajama Day [Sour"), "Pajama Day ");
  assert.equal(completePartialMarkdown("Pajama Day [1]"), "Pajama Day [1]");
  assert.equal(completePartialMarkdown("Tom&am"), "Tom");
  assert.equal(completePartialMarkdown("Intro\n\n```\ncode"), "Intro\n\n```\ncode\n```");
  assert.equal(completePartialMarkdown("Answer.\n---FOLL"), "Answer.\n");
  assert.equal(completePartialMarkdown("Title\n-"), "Title\n");
  assert.equal(completePartialMarkdown("List:\n- "), "List:\n");
  assert.equal(completePartialMarkdown("**A** and **B"), "**A** and **B**");
  assert.equal(completePartialMarkdown("- **A** done\n- **B"), "- **A** done\n- **B**");
  assert.equal(completePartialMarkdown("**bold *both"), "**bold *both***");
});

test("streaming: earlier paragraphs are untouched", () => {
  assert.equal(completePartialMarkdown("5 * 3\n\nNext **x"), "5 * 3\n\nNext **x**");
});

const STRONG_CASES: [string, string][] = [
  ["**Friday**[1]", "Friday"],
  ["[1]**Friday**", "Friday"],
  ["**Friday[1]**", "Friday"],
  ["**Note:**text", "Note:"],
  ["**Note:** text", "Note:"],
  ["** text ** here", "text"],
  ["Cost: **$20**", "$20"],
  ["costs**$20**each", "$20"],
  ["**“Quoted”**and more", "“Quoted”"],
  ["said**“Hi”**", "“Hi”"],
  ["**完了。**次の", "完了。"],
  ["日本語**テスト**です", "テスト"],
  ["\\*\\*Escaped\\*\\* bold", "Escaped"],
  ["- **Bold** in a list", "Bold"],
  ["1. **Bold**: in an ordered list", "Bold"],
  ["-**Bold** missing space", "Bold"],
  ["• **Bullet** char", "Bullet"],
  ["* **Star** bullet", "Star"],
  ["**Bold with [link](https://x.example) inside:**after", "Bold with "],
  ["**Zero​width**", "Zerowidth"],
  ["| a | b |\n|---|---|\n| **cell:**x | y |", "cell:"],
  ["# **Heading:**x", "Heading:"],
  ["> **Quote:**x", "Quote:"],
];

for (const [input, strong] of STRONG_CASES) {
  test(`final: ${JSON.stringify(input)} renders <strong>`, () => {
    const html = render(input);
    assert.match(html, /<strong[^>]*>/, html);
    assert.ok(html.includes(`>${strong}`), html);
    assert.ok(!visibleText(html).includes("**"), html);
  });
}

test("final: citations next to bold still become badges", () => {
  const html = render("**Friday**[1] and [2]**Saturday**");
  assert.equal((html.match(/<button/g) ?? []).length, 2, html);
  assert.ok(!visibleText(html).includes("["), html);
});

test("final: lone * stays when it isn't emphasis", () => {
  assert.ok(visibleText(render("5 * 3 = 15")).includes("5 * 3 = 15"));
  assert.ok(visibleText(render("Price* applies")).includes("Price*"));
  assert.ok(visibleText(render("snake_case_name")).includes("snake_case_name"));
  assert.ok(visibleText(render("about ~5 minutes or ~10")).includes("~5 minutes or ~10"));
});

test("final: lone *em* that fails flanking becomes <em>", () => {
  assert.match(render("*Note:*text"), /<em[^>]*>Note:<\/em>text/);
});

test("final: HTML entities show as characters", () => {
  const text = visibleText(render("Tom&#39;s &amp;amp; Jerry&rsquo;s &quot;club&quot; &amp;#39;x&amp;#39; &nbsp;ok"));
  assert.equal(text.replace(/ /g, " "), "Tom's & Jerry’s \"club\" 'x'  ok");
  // A literal tag written as entities stays text, never markup.
  assert.ok(render("&lt;b&gt;hi&lt;/b&gt;").includes("&lt;b&gt;hi"));
});

test("final: code is left exactly as written", () => {
  assert.equal(normalizeMarkdown("`** a **` and `&amp;#39;`"), "`** a **` and `&amp;#39;`");
  assert.equal(normalizeMarkdown("```\n** a **\n```"), "```\n** a **\n```");
});

test("final: old [Source N] citations become badges", () => {
  assert.match(render("Pajama Day [Source 1]."), /<button/);
});

test("stripMarkdown: plain text with no markers", () => {
  assert.equal(stripMarkdown("**Friday**[1] is *Twin Day* [2]."), "Friday is Twin Day.");
  assert.equal(stripMarkdown("**Note:**text"), "Note:text");
  assert.equal(stripMarkdown("## Heading\n\n- **One**\n- _Two_\n1. `three`"), "Heading\n\n• One\n• Two\n1. three");
  assert.equal(stripMarkdown("See the [dress code](https://x.example/a_(b)) and ![logo](x.png)"), "See the dress code and logo");
  assert.equal(stripMarkdown("Tom&amp;#39;s &amp;amp; Jerry"), "Tom's & Jerry");
  assert.equal(stripMarkdown("\\*\\*Esc\\*\\* \\*literal"), "Esc *literal");
  assert.equal(stripMarkdown("> **Quote** ~~old~~ new"), "Quote old new");
  assert.equal(stripMarkdown("| A | B |\n|---|---|\n| 1 | 2 |"), "A · B\n1 · 2");
  assert.equal(stripMarkdown("```js\nconst a = 1;\n```"), "const a = 1;");
  assert.equal(stripMarkdown("snake_case and 5 * 3"), "snake_case and 5 * 3");
  assert.equal(stripMarkdown("cut off **mid"), "cut off mid");
  assert.equal(stripMarkdown("a ** b"), "a b");
  assert.equal(stripMarkdown("[1] Keep [2]", { citations: false }), "[1] Keep [2]");
  assert.equal(stripMarkdown("**Title**\n\nbody text", { singleLine: true }), "Title body text");
  assert.equal(stripMarkdown("one two three four five", { singleLine: true, maxLength: 12 }), "one two…");
  assert.equal(stripMarkdown(null), "");
});

test("decodeHtmlEntities handles numeric, named and double-encoded", () => {
  assert.equal(decodeHtmlEntities("&#x27;&#8217;&hellip;&amp;amp;&bogus;"), "'’…&&bogus;");
});
