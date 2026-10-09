import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import {
  announcementAnchor,
  announcementPath,
  apnsPayload,
  createApnsJwt,
  fcmMessage,
  isDeadApnsToken,
  isDeadFcmToken,
  truncateBody,
} from "./messages";

const MESSAGE = {
  title: "Early dismissal Friday",
  body: "School lets out at 12:30 for teacher training.",
  url: "/s/demo/parent/announcements",
};

test("the APNs payload carries the alert and the in-app path", () => {
  const payload = apnsPayload(MESSAGE);

  assert.deepEqual(payload.aps.alert, { title: MESSAGE.title, body: MESSAGE.body });
  assert.equal(payload.aps.sound, "default");
  assert.equal(payload.url, MESSAGE.url);
});

test("the FCM message targets one token and passes the path as data", () => {
  const message = fcmMessage("token-123", MESSAGE);

  assert.equal(message.token, "token-123");
  assert.deepEqual(message.notification, { title: MESSAGE.title, body: MESSAGE.body });
  assert.deepEqual(message.data, { url: MESSAGE.url });
  assert.equal(message.android.priority, "high");
});

test("long bodies are cut at a word with an ellipsis", () => {
  const long = "word ".repeat(100).trim();
  const cut = truncateBody(long, 40);

  assert.ok(cut.length <= 40);
  assert.ok(cut.endsWith("…"));
  assert.ok(!cut.includes("wor…"));
  assert.equal(truncateBody("short", 40), "short");
});

test("the APNs JWT is ES256, carries the key id and team, and verifies", () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

  const jwt = createApnsJwt({ keyId: "KEY123", teamId: "TEAM456", privateKey: pem }, 1_700_000_000);
  const [header, claims, signature] = jwt.split(".");

  assert.deepEqual(JSON.parse(Buffer.from(header, "base64url").toString()), {
    alg: "ES256",
    kid: "KEY123",
  });
  assert.deepEqual(JSON.parse(Buffer.from(claims, "base64url").toString()), {
    iss: "TEAM456",
    iat: 1_700_000_000,
  });
  assert.equal(
    crypto.verify(
      "sha256",
      Buffer.from(`${header}.${claims}`),
      { key: publicKey, dsaEncoding: "ieee-p1363" },
      Buffer.from(signature, "base64url")
    ),
    true
  );
});

test("dead APNs tokens are recognised, other failures are not", () => {
  assert.equal(isDeadApnsToken(410, "Unregistered"), true);
  assert.equal(isDeadApnsToken(400, "BadDeviceToken"), true);
  assert.equal(isDeadApnsToken(400, "PayloadTooLarge"), false);
  assert.equal(isDeadApnsToken(500, "InternalServerError"), false);
});

test("dead FCM tokens are recognised, other failures are not", () => {
  assert.equal(isDeadFcmToken(404, "UNREGISTERED"), true);
  assert.equal(isDeadFcmToken(400, "INVALID_ARGUMENT"), false);
  assert.equal(isDeadFcmToken(429, "QUOTA_EXCEEDED"), false);
  assert.equal(isDeadFcmToken(503, "UNAVAILABLE"), false);
});

test("announcement notifications open the announcement itself", () => {
  assert.equal(
    announcementPath("collegiate", "8f1c"),
    "/s/collegiate/parent/announcements#announcement-8f1c"
  );
  // The announcements page uses the same id on each <article>.
  assert.equal(announcementAnchor("8f1c"), "announcement-8f1c");
});
