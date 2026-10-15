import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanWebsiteText, formatText, parseInline, type Block } from "./format-text";

const types = (blocks: Block[]) => blocks.map((b) => b.type);

test("markdown, standalone and ALL CAPS headings", () => {
  const text = "# Handbook\n\nArrival\n\nDoors open at 7:45 each morning.\n\nLUNCH\nBring a water bottle.";
  const blocks = formatText(text);
  assert.deepEqual(types(blocks), ["heading", "heading", "paragraph", "heading", "paragraph"]);
  assert.deepEqual(
    blocks.filter((b) => b.type === "heading").map((b) => b.type === "heading" && [b.level, b.text]),
    [[1, "Handbook"], [3, "Arrival"], [2, "LUNCH"]]
  );
});

test("short lines ending in punctuation are not headings", () => {
  const blocks = formatText("Hi families,\n\nSee the note below.\n\nThanks!");
  assert.ok(blocks.every((b) => b.type === "paragraph"));
});

test("bullet lists, including unicode bullets and wrapped items", () => {
  const text = "Bring:\n• Water bottle\n• A snack for the afternoon break that is nut free and\n  clearly labelled\n\nThat is all.";
  const blocks = formatText(text);
  assert.deepEqual(types(blocks), ["paragraph", "list", "paragraph"]);
  const list = blocks[1];
  assert.ok(list.type === "list" && !list.ordered);
  assert.equal(list.items.length, 2);
  assert.match(list.items[1].text, /nut free and\s+clearly labelled$/);
});

test("numbered and lettered lists", () => {
  const blocks = formatText("1. Sign the form\n2) Return it\n\n3. Pay the fee\n\na) first\nb) second");
  assert.deepEqual(types(blocks), ["list", "list"]);
  assert.ok(blocks[0].type === "list" && blocks[0].ordered && blocks[0].items.length === 3);
  assert.ok(blocks[1].type === "list" && blocks[1].items.map((i) => i.text).join() === "first,second");
});

test("pipe, tab and space-aligned tables", () => {
  const pipe = formatText("| Day | Time |\n|---|---|\n| Mon | 9am |\n| Tue | 10am |");
  assert.equal(pipe.length, 1);
  assert.ok(pipe[0].type === "table" && pipe[0].header);
  assert.deepEqual(pipe[0].type === "table" && pipe[0].rows, [["Day", "Time"], ["Mon", "9am"], ["Tue", "10am"]]);

  const tab = formatText("Grade\tTeacher\n3\tMs. Kim\n4\tMr. Ode");
  assert.ok(tab[0].type === "table" && tab[0].rows.length === 3);

  const space = formatText("Event      Date      Room\nConcert    Oct 3     Gym\nPlay       Nov 9     Hall");
  assert.ok(space[0].type === "table" && space[0].rows[2][2] === "Hall");
});

test("double spaces after full stops are not a table", () => {
  const blocks = formatText("It starts at noon.  Please be early.\nWe end at three.  Pickup is outside.");
  assert.deepEqual(types(blocks), ["paragraph"]);
});

test("paragraphs join hard-wrapped lines but keep short line breaks", () => {
  const wrapped =
    "The school will be closed on Monday for the staff development day and will\nreopen on Tuesday.";
  const [p] = formatText(wrapped);
  assert.ok(p.type === "paragraph");
  assert.equal(p.text, wrapped.replace("\n", " "));

  const [addr] = formatText("Main Office\n12 School Lane\nSpringfield");
  assert.ok(addr.type === "paragraph" && addr.text === "Main Office\n12 School Lane\nSpringfield");
});

test("offsets map back to the original text", () => {
  const text = "Intro line that is long enough to be wrapped onto the following line\nof text.\n\n- item one\n- item two";
  const blocks = formatText(text, 100);
  for (const b of blocks) {
    if ("textStart" in b) {
      assert.equal(b.text.replace(/ /g, ""), text.slice(b.textStart - 100, b.textStart - 100 + b.text.length).replace(/\s/g, ""));
    }
    if (b.type === "list") {
      for (const it of b.items) assert.equal(text.slice(it.textStart - 100, it.end - 100), it.text);
    }
  }
  assert.equal(blocks[0].start, 100);
  assert.equal(blocks[1].end, 100 + text.length);
});

test("quotes and rules", () => {
  const blocks = formatText("> quoted line\n> another\n\n---\n\nAfter.");
  assert.deepEqual(types(blocks), ["quote", "hr", "paragraph"]);
  assert.ok(blocks[0].type === "quote" && blocks[0].text === "quoted line\nanother");
});

test("parseInline: Label <url> hides the url", () => {
  const segs = parseInline("Please Register now <https://track.example.com/abc?u=1> today.");
  const link = segs.find((s) => s.type === "link");
  assert.ok(link && link.type === "link");
  assert.equal(link.text, "Please Register now");
  assert.equal(link.href, "https://track.example.com/abc?u=1");
  assert.equal(segs.map((s) => s.text).join(""), "Please Register now today.");
});

test("parseInline: label stops at punctuation and word limit", () => {
  const segs = parseInline("Questions? Read the full parent handbook for this school year <https://x.org/h>");
  const link = segs.find((s) => s.type === "link");
  assert.equal(link?.text, "handbook for this school year");
  const bare = parseInline("Done. <https://x.org/very/long/path>");
  assert.equal(bare.find((s) => s.type === "link")?.text, "x.org");
});

test("parseInline: autolinks urls, www and email; long urls show hostname", () => {
  const segs = parseInline(
    "Visit www.school.org, email office@school.org or https://click.mail.example.com/ls/click?upn=aaaaaaaaaaaaaaaaaaaaaaaa."
  );
  const links = segs.filter((s) => s.type === "link");
  assert.deepEqual(
    links.map((l) => l.type === "link" && [l.text, l.href]),
    [
      ["www.school.org", "https://www.school.org"],
      ["office@school.org", "mailto:office@school.org"],
      ["click.mail.example.com", "https://click.mail.example.com/ls/click?upn=aaaaaaaaaaaaaaaaaaaaaaaa"],
    ]
  );
  assert.ok(segs[segs.length - 1].text === ".");
});

test("cleanWebsiteText blanks title, url and nav noise, keeping length", () => {
  const text = "Admissions\nhttps://school.org/admissions\n\nSkip To Main Content\nApply by January 15.";
  const cleaned = cleanWebsiteText(text, "Admissions", "https://school.org/admissions");
  assert.equal(cleaned.length, text.length);
  assert.equal(cleaned.trim(), "Apply by January 15.");
  assert.equal(cleaned.indexOf("Apply"), text.indexOf("Apply"));
});
