import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseEmailAddress,
  senderDomainAllowed,
  extractInboundTokens,
  routeInboundMessage,
  normalizeSenderDomain,
  isStaleClaim,
  senderGate,
  type InboundAddress,
} from "./inbound";

test("parseEmailAddress extracts bare address from display form", () => {
  assert.equal(
    parseEmailAddress("Lincoln High <office@lincolnhigh.org>"),
    "office@lincolnhigh.org"
  );
  assert.equal(parseEmailAddress("office@lincolnhigh.org"), "office@lincolnhigh.org");
  assert.equal(parseEmailAddress("OFFICE@Lincolnhigh.ORG"), "office@lincolnhigh.org");
});

test("parseEmailAddress returns null for garbage", () => {
  assert.equal(parseEmailAddress(""), null);
  assert.equal(parseEmailAddress("not-an-email"), null);
});

test("senderDomainAllowed matches exact domain", () => {
  assert.equal(
    senderDomainAllowed("a@lincolnhigh.org", ["lincolnhigh.org"]),
    true
  );
});

test("senderDomainAllowed matches subdomains", () => {
  assert.equal(
    senderDomainAllowed("a@mail.lincolnhigh.org", ["lincolnhigh.org"]),
    true
  );
});

test("senderDomainAllowed rejects lookalike / non-suffix", () => {
  assert.equal(
    senderDomainAllowed("a@notlincolnhigh.org", ["lincolnhigh.org"]),
    false
  );
  assert.equal(
    senderDomainAllowed("a@lincolnhigh.org.evil.com", ["lincolnhigh.org"]),
    false
  );
  assert.equal(senderDomainAllowed("a@gmail.com", ["lincolnhigh.org"]), false);
});

test("senderDomainAllowed tolerates a leading @ in the allowlist entry", () => {
  assert.equal(senderDomainAllowed("a@lincolnhigh.org", ["@lincolnhigh.org"]), true);
});

test("senderDomainAllowed is false for null address or empty list", () => {
  assert.equal(senderDomainAllowed(null, ["lincolnhigh.org"]), false);
  assert.equal(senderDomainAllowed("a@lincolnhigh.org", []), false);
});

test("extractInboundTokens pulls the local part for the inbound domain", () => {
  assert.deepEqual(
    extractInboundTokens(
      ["ams-ab12cd34@inbound.askmyschool.com"],
      "inbound.askmyschool.com"
    ),
    ["ams-ab12cd34"]
  );
});

test("extractInboundTokens keeps every inbound address once, in order", () => {
  assert.deepEqual(
    extractInboundTokens(
      [
        "Upper <ams-upper@inbound.askmyschool.com>",
        "office@lincolnhigh.org",
        "ams-lower@inbound.askmyschool.com",
        "AMS-UPPER@inbound.askmyschool.com",
      ],
      "inbound.askmyschool.com"
    ),
    ["ams-upper", "ams-lower"]
  );
});

test("normalizeSenderDomain accepts valid domains and strips prefixes", () => {
  assert.equal(normalizeSenderDomain("lincolnhigh.org"), "lincolnhigh.org");
  assert.equal(normalizeSenderDomain("@lincolnhigh.org"), "lincolnhigh.org");
  assert.equal(normalizeSenderDomain("*.lincolnhigh.org"), "lincolnhigh.org");
  assert.equal(normalizeSenderDomain("  Mail.Lincolnhigh.ORG "), "mail.lincolnhigh.org");
});

test("normalizeSenderDomain rejects invalid input", () => {
  assert.equal(normalizeSenderDomain("not a domain"), null);
  assert.equal(normalizeSenderDomain("localhost"), null);
  assert.equal(normalizeSenderDomain("a@b.com"), null);
  assert.equal(normalizeSenderDomain(""), null);
});

test("extractInboundTokens ignores addresses on other domains", () => {
  assert.deepEqual(
    extractInboundTokens(
      ["someone@gmail.com", "ams-xyz@inbound.askmyschool.com"],
      "inbound.askmyschool.com"
    ),
    ["ams-xyz"]
  );
  assert.deepEqual(
    extractInboundTokens(["someone@gmail.com"], "inbound.askmyschool.com"),
    []
  );
});

const ADDRESSES: InboundAddress[] = [
  { token: "ams-school", school_id: "s1", division_id: null },
  { token: "ams-lower", school_id: "s1", division_id: "div-lower" },
  { token: "ams-upper", school_id: "s1", division_id: "div-upper" },
  { token: "ams-other", school_id: "s2", division_id: "div-other" },
];

test("routeInboundMessage marks mail to a division address with that division", () => {
  assert.deepEqual(routeInboundMessage(["ams-upper"], ADDRESSES), {
    schoolId: "s1",
    divisionIds: ["div-upper"],
  });
});

test("routeInboundMessage gives whole-school mail no division", () => {
  assert.deepEqual(routeInboundMessage(["ams-school"], ADDRESSES), {
    schoolId: "s1",
    divisionIds: [],
  });
});

test("routeInboundMessage collects every division address the mail reached", () => {
  assert.deepEqual(
    routeInboundMessage(["ams-school", "ams-lower", "ams-upper"], ADDRESSES),
    { schoolId: "s1", divisionIds: ["div-lower", "div-upper"] }
  );
});

test("routeInboundMessage keeps to the first school's addresses", () => {
  assert.deepEqual(
    routeInboundMessage(["ams-unknown", "ams-lower", "ams-other"], ADDRESSES),
    { schoolId: "s1", divisionIds: ["div-lower"] }
  );
});

test("routeInboundMessage is null when no address is known", () => {
  assert.equal(routeInboundMessage(["ams-unknown"], ADDRESSES), null);
  assert.equal(routeInboundMessage([], ADDRESSES), null);
});

test("isStaleClaim keeps a fresh claim and expires an old one", () => {
  const now = new Date("2026-10-06T12:00:00Z");
  assert.equal(isStaleClaim("2026-10-06T11:55:00Z", now), false);
  assert.equal(isStaleClaim("2026-10-06T11:49:00Z", now), true);
});

test("isStaleClaim treats an unreadable timestamp as stale", () => {
  assert.equal(isStaleClaim("not-a-date"), true);
});

test("senderGate holds mail for review when no allowlist is set", () => {
  assert.equal(senderGate("a@anywhere.com", []), "review");
  assert.equal(senderGate("a@anywhere.com", null), "review");
  assert.equal(senderGate("a@anywhere.com", undefined), "review");
  assert.equal(senderGate("a@anywhere.com", ["  "]), "review");
  assert.equal(senderGate(null, []), "review");
});

test("senderGate allows allowlisted senders and rejects others", () => {
  assert.equal(senderGate("office@lincolnhigh.org", ["lincolnhigh.org"]), "allow");
  assert.equal(senderGate("a@mail.lincolnhigh.org", ["lincolnhigh.org"]), "allow");
  assert.equal(senderGate("a@evil.com", ["lincolnhigh.org"]), "reject");
  assert.equal(senderGate("a@notlincolnhigh.org", ["lincolnhigh.org"]), "reject");
  assert.equal(senderGate(null, ["lincolnhigh.org"]), "reject");
});
