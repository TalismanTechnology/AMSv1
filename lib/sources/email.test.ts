import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEmailText, splitQuoted } from "./email";

test("parses the header block an .eml upload is stored with", () => {
  const text = [
    "Subject: Picture day",
    "From: Front Office <office@school.org>",
    "To: parents@school.org",
    "Date: Mon, 06 Oct 2025 13:00:00 GMT",
    "Attachments: flyer.pdf",
    "",
    "Picture day is Thursday.",
  ].join("\n");
  const parsed = parseEmailText(text);
  assert.deepEqual(parsed.headers, {
    subject: "Picture day",
    from: "Front Office <office@school.org>",
    to: "parents@school.org",
    date: "Mon, 06 Oct 2025 13:00:00 GMT",
  });
  assert.equal(parsed.body, "Picture day is Thursday.");
  assert.equal(text.slice(parsed.bodyStart), parsed.body);
});

test("header parsing is case-insensitive, tolerates blank lines, maps Sent to date", () => {
  const parsed = parseEmailText("\nFROM: a@b.org\n\nsent: Tuesday\nsubject: Hi\n\nBody here");
  assert.equal(parsed.headers.from, "a@b.org");
  assert.equal(parsed.headers.date, "Tuesday");
  assert.equal(parsed.headers.subject, "Hi");
  assert.equal(parsed.body, "Body here");
});

test("text without headers is all body", () => {
  const text = "To: all families — the gym is closed.\nSee you soon.";
  const parsed = parseEmailText(text);
  assert.deepEqual(parsed.headers, {});
  assert.equal(parsed.body, text);
  assert.equal(parsed.bodyStart, 0);
  assert.equal(parsed.forwarded, null);
});

test("reads a Gmail forwarded message block", () => {
  const text = [
    "FYI, see below.",
    "",
    "---------- Forwarded message ---------",
    "From: Coach Lee <lee@school.org>",
    "Date: Mon, Oct 6, 2025 at 9:00 AM",
    "Subject: Practice moved",
    "To: <office@school.org>",
    "",
    "Practice is moved to 4pm.",
  ].join("\n");
  const parsed = parseEmailText(text);
  assert.ok(parsed.forwarded);
  assert.equal(parsed.forwarded.headers.from, "Coach Lee <lee@school.org>");
  assert.equal(parsed.forwarded.headers.subject, "Practice moved");
  assert.equal(parsed.forwarded.headers.date, "Mon, Oct 6, 2025 at 9:00 AM");
  assert.ok(text.slice(parsed.forwarded.start).startsWith("---------- Forwarded"));
  assert.ok(text.slice(0, parsed.forwarded.end).endsWith("To: <office@school.org>"));
});

test("splits at a wrapped Gmail 'On … wrote:' line", () => {
  const body = [
    "Yes, that works.",
    "",
    "On Mon, Oct 6, 2025 at 9:00 AM Jane Doe <",
    "jane@school.org> wrote:",
    "> Can we meet Friday?",
  ].join("\n");
  const split = splitQuoted(body);
  assert.equal(split.main, "Yes, that works.");
  assert.ok(split.quoted?.startsWith("On Mon"));
  assert.equal(body.slice(split.quotedStart!), split.quoted);
});

test("splits at an Outlook reply header", () => {
  const body = [
    "Thanks, see you then.",
    "",
    "________________________________",
    "From: Jane Doe <jane@school.org>",
    "Sent: Monday, October 6, 2025 9:00 AM",
    "To: Office",
    "Subject: Meeting",
    "",
    "Can we meet?",
  ].join("\n");
  const split = splitQuoted(body);
  assert.equal(split.main, "Thanks, see you then.");
  assert.ok(split.quoted?.includes("Sent: Monday"));
});

test("splits at Original Message, trailing > quotes and signatures", () => {
  assert.equal(
    splitQuoted("Done.\n\n-----Original Message-----\nFrom: x").main,
    "Done."
  );
  assert.equal(splitQuoted("Sounds good.\n\n> earlier\n>\n> more").main, "Sounds good.");
  const sig = splitQuoted("See you Friday.\n-- \nJane Doe\nPrincipal");
  assert.equal(sig.main, "See you Friday.");
  assert.equal(sig.quoted, "-- \nJane Doe\nPrincipal".trim());
});

test("never leaves main empty", () => {
  const body = "> only a quote\n> nothing else";
  assert.deepEqual(splitQuoted(body), { main: body, quoted: null, quotedStart: null });
  const plain = "Just a message.";
  assert.deepEqual(splitQuoted(plain), { main: plain, quoted: null, quotedStart: null });
});
