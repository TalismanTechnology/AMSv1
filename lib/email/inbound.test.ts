import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseEmailAddress,
  senderDomainAllowed,
  extractInboundToken,
  normalizeSenderDomain,
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

test("extractInboundToken pulls the local part for the inbound domain", () => {
  assert.equal(
    extractInboundToken(
      ["ams-ab12cd34@inbound.askmyschool.com"],
      "inbound.askmyschool.com"
    ),
    "ams-ab12cd34"
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

test("extractInboundToken ignores addresses on other domains", () => {
  assert.equal(
    extractInboundToken(
      ["someone@gmail.com", "ams-xyz@inbound.askmyschool.com"],
      "inbound.askmyschool.com"
    ),
    "ams-xyz"
  );
  assert.equal(
    extractInboundToken(["someone@gmail.com"], "inbound.askmyschool.com"),
    null
  );
});
