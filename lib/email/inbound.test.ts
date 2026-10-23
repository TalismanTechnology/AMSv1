import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseEmailAddress,
  extractInboundTokens,
  routeInboundMessage,
  isStaleClaim,
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
