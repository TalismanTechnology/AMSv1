import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanTopics,
  contactWindows,
  dedupeContacts,
  detectDivision,
  emailAppearsVerbatim,
  formatContactDirectory,
  hasSpecialistContacts,
  isMissingTableError,
  mailtoHref,
  phoneAppearsVerbatim,
  selectContact,
  telHref,
  verifyExtractedContact,
  type SchoolContact,
} from "./directory";

const LOWER = "div-lower";
const UPPER = "div-upper";

let n = 0;
const contact = (extra: Partial<SchoolContact>): SchoolContact => ({
  id: `c${++n}`,
  school_id: "s",
  name: "Staff",
  role: "Role",
  email: "staff@school.org",
  phone: null,
  division_id: null,
  topics: [],
  status: "approved",
  source: "admin",
  source_document_id: null,
  source_excerpt: null,
  created_at: "",
  updated_at: "",
  ...extra,
});

const office = contact({ id: "office", topics: ["main_office"] });
const nurse = contact({ id: "nurse", topics: ["health"] });
const lowerNurse = contact({ id: "lower-nurse", topics: ["health"], division_id: LOWER });
const upperAthletics = contact({ id: "upper-ath", topics: ["athletics"], division_id: UPPER });

// ── missing table ──────────────────────────────────────────────────

test("missing-table errors are recognised by code or message", () => {
  assert.equal(isMissingTableError({ code: "42P01", message: "x" }), true);
  assert.equal(isMissingTableError({ code: "PGRST205", message: "x" }), true);
  assert.equal(
    isMissingTableError({
      message: "Could not find the table 'public.school_contacts' in the schema cache",
    }),
    true
  );
  assert.equal(
    isMissingTableError({ message: 'relation "public.school_contacts" does not exist' }),
    true
  );
});

test("other errors are not missing-table errors", () => {
  assert.equal(isMissingTableError(null), false);
  assert.equal(isMissingTableError({ code: "42501", message: "permission denied" }), false);
  assert.equal(
    isMissingTableError({ message: 'relation "public.other" does not exist' }),
    false
  );
});

// ── selection ──────────────────────────────────────────────────────

test("a topic specialist beats the main office", () => {
  const picked = selectContact([office, nurse], { topic: "health" });
  assert.equal(picked?.contact.id, "nurse");
  assert.equal(picked?.matchedBy, "topic");
});

test("no specialist for the topic falls back to the main office", () => {
  const picked = selectContact([office, nurse], { topic: "transportation" });
  assert.equal(picked?.contact.id, "office");
  assert.equal(picked?.matchedBy, "main_office");
});

test("an unclassified question goes to the main office", () => {
  assert.equal(selectContact([nurse, office], { topic: null })?.contact.id, "office");
});

test("no specialist and no main office means no card", () => {
  assert.equal(selectContact([nurse], { topic: "athletics" }), null);
  assert.equal(selectContact([], { topic: "health" }), null);
});

test("the asker's division is preferred, then the whole school", () => {
  assert.equal(
    selectContact([nurse, lowerNurse], { topic: "health", divisionId: LOWER })?.contact.id,
    "lower-nurse"
  );
  assert.equal(
    selectContact([lowerNurse, nurse], { topic: "health", divisionId: UPPER })?.contact.id,
    "nurse"
  );
});

test("unknown division prefers the whole-school contact", () => {
  assert.equal(
    selectContact([lowerNurse, nurse], { topic: "health" })?.contact.id,
    "nurse"
  );
});

test("unknown division may still use a division-only specialist", () => {
  assert.equal(
    selectContact([office, upperAthletics], { topic: "athletics" })?.contact.id,
    "upper-ath"
  );
});

test("another division's specialist is skipped when the division is known", () => {
  const picked = selectContact([office, upperAthletics], {
    topic: "athletics",
    divisionId: LOWER,
  });
  assert.equal(picked?.contact.id, "office");
});

test("only approved, reachable contacts are used", () => {
  const suggestedNurse = contact({ id: "sug", topics: ["health"], status: "suggested" });
  const unreachable = contact({ id: "none", topics: ["health"], email: " ", phone: null });
  assert.equal(
    selectContact([suggestedNurse, unreachable, office], { topic: "health" })?.contact.id,
    "office"
  );
});

test("the more specialised contact wins a tie", () => {
  const generalist = contact({ id: "gen", topics: ["health", "athletics", "academics"] });
  assert.equal(
    selectContact([generalist, nurse], { topic: "health" })?.contact.id,
    "nurse"
  );
});

test("hasSpecialistContacts ignores main-office-only directories", () => {
  assert.equal(hasSpecialistContacts([office]), false);
  assert.equal(hasSpecialistContacts([office, nurse]), true);
});

test("cleanTopics keeps known topics in canonical order", () => {
  assert.deepEqual(cleanTopics(["health", "bogus", "athletics", "health", 3]), [
    "health",
    "athletics",
  ]);
});

// ── division detection ─────────────────────────────────────────────

const divisions = [
  { id: LOWER, name: "Lower School" },
  { id: "div-middle", name: "Middle School" },
  { id: UPPER, name: "Upper School" },
];

test("detects a division named in the question", () => {
  assert.equal(detectDivision("Who is the Lower School nurse?", divisions), LOWER);
  assert.equal(detectDivision("bus for upper-school students", divisions), UPPER);
  assert.equal(detectDivision("do middle schoolers need a laptop", divisions), "div-middle");
});

test("no division, or more than one, is null", () => {
  assert.equal(detectDivision("when is the school play", divisions), null);
  assert.equal(detectDivision("lower school and upper school pickup", divisions), null);
});

// ── links ──────────────────────────────────────────────────────────

test("tel: links keep digits, a leading + and an extension", () => {
  assert.equal(telHref("(212) 555-0100"), "tel:2125550100");
  assert.equal(telHref("+1 212.555.0100 ext. 204"), "tel:+12125550100,204");
  assert.equal(telHref("212-555-0100 x12"), "tel:2125550100,12");
  assert.equal(telHref("call us"), null);
});

test("mailto: links only for real-looking addresses", () => {
  assert.equal(mailtoHref(" nurse@school.org "), "mailto:nurse@school.org");
  assert.equal(mailtoHref("nurse at school"), null);
  assert.equal(mailtoHref("a@b"), null);
});

// ── verbatim validation ────────────────────────────────────────────

const TEXT = `Health Office
Questions about medication? Contact Jane Smith, School Nurse, at JSmith@School.org or (212) 555-0100.
Transportation: buses@school.org`;

test("emails must appear in the text (case-insensitive)", () => {
  assert.equal(emailAppearsVerbatim("jsmith@school.org", TEXT), true);
  assert.equal(emailAppearsVerbatim("jane.smith@school.org", TEXT), false);
});

test("phones must appear exactly as written", () => {
  assert.equal(phoneAppearsVerbatim("(212) 555-0100", TEXT), true);
  assert.equal(phoneAppearsVerbatim("212-555-0100", TEXT), false);
  assert.equal(phoneAppearsVerbatim("(212) 555-0199", TEXT), false);
  assert.equal(phoneAppearsVerbatim("0100", TEXT), false);
});

test("extracted contacts keep only details found in the text", () => {
  const out = verifyExtractedContact(
    {
      name: " Jane Smith ",
      role: "School Nurse",
      email: "JSmith@School.org",
      phone: "212-555-0100", // reformatted by the model: dropped
      topics: ["health", "made_up"],
      excerpt: "Contact Jane Smith, School Nurse",
    },
    TEXT
  );
  assert.deepEqual(out, {
    name: "Jane Smith",
    role: "School Nurse",
    email: "JSmith@School.org",
    phone: null,
    topics: ["health"],
    excerpt: "Contact Jane Smith, School Nurse",
  });
});

test("a contact with no verified email or phone is rejected", () => {
  assert.equal(
    verifyExtractedContact(
      {
        name: "Bob Jones",
        role: "Athletic Director",
        email: "bjones@school.org",
        phone: "(212) 555-0177",
        topics: ["athletics"],
        excerpt: null,
      },
      TEXT
    ),
    null
  );
});

test("an excerpt that isn't from the text is dropped", () => {
  const out = verifyExtractedContact(
    {
      name: "",
      role: "Transportation",
      email: "buses@school.org",
      phone: null,
      topics: ["transportation"],
      excerpt: "Email the bus office any time",
    },
    TEXT
  );
  assert.equal(out?.excerpt, null);
  assert.equal(out?.email, "buses@school.org");
});

// ── dedupe ─────────────────────────────────────────────────────────

test("dedupe drops matches on email, full name, or phone without email", () => {
  const existing = [
    { name: "Jane Smith", email: "jsmith@school.org", phone: null },
    { name: "Front Desk", email: null, phone: "(212) 555-0000" },
  ];
  const candidates = [
    { name: "J. Smith", email: "JSMITH@school.org ", phone: null }, // same email
    { name: "jane  smith", email: "other@school.org", phone: null }, // same name
    { name: "Reception", email: null, phone: "212.555.0000" }, // same phone
    { name: "Bob Jones", email: "bob@school.org", phone: "(212) 555-0000" }, // shared switchboard ok
    { name: "Bob Jones", email: "bob2@school.org", phone: null }, // repeat of the previous candidate
  ];
  assert.deepEqual(
    dedupeContacts(candidates, existing).map((c) => c.email),
    ["bob@school.org"]
  );
});

// ── contact windows ────────────────────────────────────────────────

test("windows surround contact details and are verbatim substrings", () => {
  const filler = "lorem ipsum ".repeat(100);
  const text = `${filler}Nurse: nurse@school.org${filler}Call (212) 555-0100 today${filler}`;
  const windows = contactWindows(text, { radius: 20 });
  assert.equal(windows.length, 2);
  assert.ok(windows[0].includes("nurse@school.org"));
  assert.ok(windows[1].includes("(212) 555-0100"));
  for (const w of windows) assert.ok(text.includes(w));
});

test("windows are capped and empty when there are no contact details", () => {
  assert.deepEqual(contactWindows("no contact details here"), []);
  const many = Array.from({ length: 50 }, (_, i) => `x${i}@school.org`).join(" ".repeat(400));
  const total = contactWindows(many, { maxChars: 1000 }).reduce((s, w) => s + w.length, 0);
  assert.ok(total <= 1000);
});

test("formatContactDirectory: approved, reachable contacts only, details verbatim", () => {
  const base = { division_id: null, topics: ["health"], status: "approved" as const };
  const out = formatContactDirectory(
    [
      { ...base, name: "Ann Lee", role: "School Nurse", email: "nurse@school.org", phone: "(212) 555-0100", division_id: LOWER },
      { ...base, name: "No Way", role: "Ghost", email: null, phone: null },
      { ...base, name: "Pending Pat", role: "Coach", email: "pat@school.org", phone: null, status: "suggested" as const },
    ],
    [{ id: LOWER, name: "Lower School" }]
  );
  assert.match(out, /<staff_contacts>/);
  assert.match(out, /Ann Lee — School Nurse \| Division: Lower School \| Handles: Health & nurse \| Email: nurse@school\.org \| Phone: \(212\) 555-0100/);
  assert.doesNotMatch(out, /No Way|Pending Pat/);
  assert.match(out, /Never invent/);
});

test("formatContactDirectory: nothing usable → empty string", () => {
  assert.equal(formatContactDirectory([]), "");
});
