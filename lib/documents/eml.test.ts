import test from "node:test";
import assert from "node:assert/strict";
import { parseEml } from "./eml";
import { fileTypeFromName } from "./file-types";
import { extractSegments } from "./parser";
import { formatChunkLocation } from "@/lib/ai/rag";

// A realistic multipart message: text + HTML alternative, a PDF attachment, an
// inline signature image, and a subject encoded per RFC 2047.
function buildEml(): Buffer {
  const pdf = Buffer.from("%PDF-1.4 fake permission slip").toString("base64");
  const png = Buffer.from("fake-png-bytes").toString("base64");

  return Buffer.from(
    [
      "From: Front Office <office@collegiate.example>",
      "To: Parents <parents@collegiate.example>",
      "Subject: =?utf-8?B?RmllbGQgVHJpcCDigJMgQWN0aW9uIE5lZWRlZA==?=",
      "Date: Tue, 3 Mar 2026 09:15:00 +0000",
      "MIME-Version: 1.0",
      'Content-Type: multipart/mixed; boundary="OUTER"',
      "",
      "--OUTER",
      'Content-Type: multipart/alternative; boundary="INNER"',
      "",
      "--INNER",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "The Grade 5 field trip to the aquarium is on March 14th.",
      "Please return the signed permission slip by March 10th.",
      "",
      "--INNER",
      "Content-Type: text/html; charset=utf-8",
      "",
      "<html><body><p>HTML version</p></body></html>",
      "--INNER--",
      "",
      "--OUTER",
      "Content-Type: application/pdf",
      'Content-Disposition: attachment; filename="permission-slip.pdf"',
      "Content-Transfer-Encoding: base64",
      "",
      pdf,
      "",
      "--OUTER",
      "Content-Type: image/png",
      'Content-Disposition: inline; filename="signature.png"',
      "Content-Transfer-Encoding: base64",
      "",
      png,
      "--OUTER--",
    ].join("\r\n"),
    "utf-8"
  );
}

test("eml extension maps to its own type, not the txt default", () => {
  assert.equal(fileTypeFromName("newsletter.eml"), "eml");
  assert.equal(fileTypeFromName("Newsletter.EML"), "eml");
});

test("decodes an RFC 2047 encoded subject", async () => {
  const email = await parseEml(buildEml());
  assert.equal(email.subject, "Field Trip – Action Needed");
});

test("extracts sender, recipient, and date", async () => {
  const email = await parseEml(buildEml());
  assert.match(email.from ?? "", /office@collegiate\.example/);
  assert.match(email.to ?? "", /parents@collegiate\.example/);
  assert.equal(email.date, "2026-03-03T09:15:00.000Z");
});

test("prefers the plain-text part over the HTML alternative", async () => {
  const email = await parseEml(buildEml());
  assert.match(email.text, /aquarium is on March 14th/);
  assert.doesNotMatch(email.text, /HTML version/);
});

test("indexable text carries the headers, not MIME machinery", async () => {
  const email = await parseEml(buildEml());
  assert.match(email.text, /^Subject: Field Trip/m);
  assert.match(email.text, /^From: /m);
  // The whole point: no boundaries or base64 payloads in the embedded text.
  assert.doesNotMatch(email.text, /--OUTER/);
  assert.doesNotMatch(email.text, /Content-Transfer-Encoding/);
  assert.doesNotMatch(email.text, /JVBERi0/);
});

test("real attachments are surfaced, inline images are not", async () => {
  const email = await parseEml(buildEml());
  assert.equal(email.attachments.length, 1);
  assert.equal(email.attachments[0].filename, "permission-slip.pdf");
  assert.match(email.text, /^Attachments: permission-slip\.pdf$/m);
});

test("a message with no attachments omits the attachments line", async () => {
  const plain = Buffer.from(
    [
      "From: office@collegiate.example",
      "Subject: Early dismissal Friday",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "School closes at noon on Friday.",
    ].join("\r\n"),
    "utf-8"
  );

  const email = await parseEml(plain);
  assert.doesNotMatch(email.text, /Attachments:/);
  assert.match(email.text, /closes at noon/);
});

test("falls back to HTML when there is no plain-text part", async () => {
  const htmlOnly = Buffer.from(
    [
      "From: office@collegiate.example",
      "Subject: Picture Day",
      "Content-Type: text/html; charset=utf-8",
      "",
      "<html><body><p>Picture day is <b>Monday</b>.</p>" +
        "<style>p{color:red}</style></body></html>",
    ].join("\r\n"),
    "utf-8"
  );

  const email = await parseEml(htmlOnly);
  assert.match(email.text, /Picture day is Monday\./);
  assert.doesNotMatch(email.text, /color:red/);
  assert.doesNotMatch(email.text, /<b>/);
});

test("a subjectless message still produces usable text", async () => {
  const noSubject = Buffer.from(
    [
      "From: office@collegiate.example",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Reminder about tomorrow.",
    ].join("\r\n"),
    "utf-8"
  );

  const email = await parseEml(noSubject);
  assert.equal(email.subject, "(no subject)");
  assert.match(email.text, /Reminder about tomorrow/);
});

// School emails often say "see attached" and put the facts in the attachment.
function buildEmlWithAttachment(filename: string, content: string): Buffer {
  return Buffer.from(
    [
      "From: Coach <coach@collegiate.example>",
      "Subject: Preseason Info",
      "MIME-Version: 1.0",
      'Content-Type: multipart/mixed; boundary="B"',
      "",
      "--B",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Please see the attached letter.",
      "",
      "--B",
      "Content-Type: application/octet-stream",
      `Content-Disposition: attachment; filename="${filename}"`,
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from(content).toString("base64"),
      "--B--",
    ].join("\r\n"),
    "utf-8"
  );
}

test("attachment content is indexed alongside the email body", async () => {
  const eml = buildEmlWithAttachment(
    "schedule.txt",
    "The bus to Golden Goal leaves at 12:30 PM on August 25th."
  );

  const segments = await extractSegments(eml, "eml");
  const text = segments.map((s) => s.text).join("\n");

  assert.match(text, /see the attached letter/);
  assert.match(text, /bus to Golden Goal leaves at 12:30 PM/);

  const attachmentSegment = segments.find((s) => /Golden Goal/.test(s.text));
  assert.equal(attachmentSegment?.metadata.attachment, "schedule.txt");
  assert.equal(attachmentSegment?.metadata.email_subject, "Preseason Info");
});

test("an unreadable attachment does not cost the email its body", async () => {
  const eml = buildEmlWithAttachment("letter.docx", "not really a docx");

  const segments = await extractSegments(eml, "eml");

  assert.ok(segments.some((s) => /see the attached letter/.test(s.text)));
});

test("attachment chunks cite the attachment by name", () => {
  assert.equal(
    formatChunkLocation({ attachment: "letter.pdf", page: 2 })?.label,
    "letter.pdf · p. 2"
  );
  assert.equal(
    formatChunkLocation({ attachment: "notes.txt", email_subject: "Info" })
      ?.label,
    "notes.txt"
  );
});
