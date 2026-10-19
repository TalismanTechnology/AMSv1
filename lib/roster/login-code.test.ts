import test from "node:test";
import assert from "node:assert/strict";
import {
  CODE_TTL_MS,
  MAX_ATTEMPTS_PER_CODE,
  RATE_LIMITS,
  decideCodeRequest,
  decideVerification,
  emailLogTag,
  generateLoginCode,
  getLoginCodeSecret,
  hashClientIp,
  hashLoginCode,
  loginCodeMatches,
  normalizeLoginCode,
  unlistedEmailKey,
} from "./login-code";
import { LOGIN_CODE_SUBJECT, buildLoginCodeEmail, escapeHtml, loginCodeFromAddress } from "./login-email";

const SECRET = "test-secret";
const SCHOOL = "school-uuid";

// ── codes ────────────────────────────────────────────────

test("codes are 6 digits, zero-padded", () => {
  for (let i = 0; i < 200; i++) assert.match(generateLoginCode(), /^\d{6}$/);
});

test("typed codes are normalised; anything but 6 digits is refused", () => {
  assert.equal(normalizeLoginCode("123456"), "123456");
  assert.equal(normalizeLoginCode(" 123 456 "), "123456");
  assert.equal(normalizeLoginCode("123-456"), "123456");
  assert.equal(normalizeLoginCode("12345"), null);
  assert.equal(normalizeLoginCode("1234567"), null);
  assert.equal(normalizeLoginCode("12345a"), null);
  assert.equal(normalizeLoginCode(123456), null);
  assert.equal(normalizeLoginCode(undefined), null);
});

test("the stored hash is an HMAC bound to school, email and secret", () => {
  const hash = hashLoginCode(SECRET, SCHOOL, "a@x.com", "012345");
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.ok(!hash.includes("012345"));
  assert.equal(hash, hashLoginCode(SECRET, SCHOOL, "a@x.com", "012345"));
  assert.notEqual(hash, hashLoginCode(SECRET, "other-school", "a@x.com", "012345"));
  assert.notEqual(hash, hashLoginCode(SECRET, SCHOOL, "b@x.com", "012345"));
  assert.notEqual(hash, hashLoginCode("other-secret", SCHOOL, "a@x.com", "012345"));

  assert.equal(loginCodeMatches(SECRET, SCHOOL, "a@x.com", "012345", hash), true);
  assert.equal(loginCodeMatches(SECRET, SCHOOL, "a@x.com", "012346", hash), false);
  assert.equal(loginCodeMatches(SECRET, SCHOOL, "b@x.com", "012345", hash), false);
  assert.equal(loginCodeMatches(SECRET, SCHOOL, "a@x.com", "012345", "not-hex"), false);
});

test("the secret falls back to BLACKBAUD_TOKEN_ENC_KEY", () => {
  const saved = { a: process.env.LOGIN_CODE_SECRET, b: process.env.BLACKBAUD_TOKEN_ENC_KEY };
  try {
    delete process.env.LOGIN_CODE_SECRET;
    delete process.env.BLACKBAUD_TOKEN_ENC_KEY;
    assert.equal(getLoginCodeSecret(), null);
    process.env.BLACKBAUD_TOKEN_ENC_KEY = "bb";
    assert.equal(getLoginCodeSecret(), "bb");
    process.env.LOGIN_CODE_SECRET = "own";
    assert.equal(getLoginCodeSecret(), "own");
  } finally {
    if (saved.a === undefined) delete process.env.LOGIN_CODE_SECRET;
    else process.env.LOGIN_CODE_SECRET = saved.a;
    if (saved.b === undefined) delete process.env.BLACKBAUD_TOKEN_ENC_KEY;
    else process.env.BLACKBAUD_TOKEN_ENC_KEY = saved.b;
  }
});

test("IPs, unlisted emails and log tags are hashed, never stored raw", () => {
  const ip = hashClientIp(SECRET, "203.0.113.7, 10.0.0.1");
  assert.equal(ip, hashClientIp(SECRET, "203.0.113.7"));
  assert.notEqual(ip, hashClientIp(SECRET, "203.0.113.8"));
  assert.ok(!ip.includes("203.0.113.7"));
  assert.equal(hashClientIp(SECRET, null), hashClientIp(SECRET, ""));

  const key = unlistedEmailKey(SECRET, SCHOOL, "a@x.com");
  assert.match(key, /^unlisted:[0-9a-f]{64}$/);
  assert.notEqual(key, unlistedEmailKey(SECRET, "other", "a@x.com"));

  assert.equal(emailLogTag("a@x.com").length, 10);
  assert.ok(!emailLogTag("a@x.com").includes("@"));
});

// ── rate limits ──────────────────────────────────────────

test("code requests: 3 per 15 minutes and 10 per day per email, 20 per hour per IP", () => {
  const ok = { emailLast15Minutes: 0, emailLast24Hours: 0, ipLastHour: 0 };
  assert.deepEqual(decideCodeRequest(ok), { allowed: true });
  assert.deepEqual(decideCodeRequest({ ...ok, emailLast15Minutes: 2, emailLast24Hours: 9, ipLastHour: 19 }), {
    allowed: true,
  });
  assert.deepEqual(decideCodeRequest({ ...ok, emailLast15Minutes: 3 }), {
    allowed: false,
    reason: "email_15_minutes",
  });
  assert.deepEqual(decideCodeRequest({ ...ok, emailLast24Hours: 10 }), {
    allowed: false,
    reason: "email_24_hours",
  });
  assert.deepEqual(decideCodeRequest({ ...ok, ipLastHour: 20 }), { allowed: false, reason: "ip_hour" });
  assert.equal(RATE_LIMITS.failedVerifiesPer15Minutes, 10);
});

// ── verification ─────────────────────────────────────────

const NOW = new Date("2026-10-18T12:00:00Z");
const live = {
  expires_at: new Date(NOW.getTime() + CODE_TTL_MS).toISOString(),
  attempts: 0,
  consumed_at: null,
};

test("a live, matching code within its attempts is accepted", () => {
  assert.equal(decideVerification({ code: live, matches: true, recentFailedAttempts: 0, now: NOW }), "ok");
  assert.equal(
    decideVerification({
      code: { ...live, attempts: MAX_ATTEMPTS_PER_CODE - 1 },
      matches: true,
      recentFailedAttempts: 9,
      now: NOW,
    }),
    "ok"
  );
});

test("wrong, missing, used, expired and worn-out codes are refused", () => {
  const base = { matches: true, recentFailedAttempts: 0, now: NOW };
  assert.equal(decideVerification({ ...base, code: live, matches: false }), "wrong_code");
  assert.equal(decideVerification({ ...base, code: null }), "no_code");
  assert.equal(decideVerification({ ...base, code: { ...live, consumed_at: NOW.toISOString() } }), "no_code");
  assert.equal(decideVerification({ ...base, code: { ...live, expires_at: NOW.toISOString() } }), "expired");
  assert.equal(
    decideVerification({ ...base, code: { ...live, attempts: MAX_ATTEMPTS_PER_CODE } }),
    "too_many_attempts"
  );
  // 10 failures across codes lock even a right code out for a while.
  assert.equal(decideVerification({ ...base, code: live, recentFailedAttempts: 10 }), "too_many_attempts");
});

test("codes last 10 minutes and allow 5 tries", () => {
  assert.equal(CODE_TTL_MS, 10 * 60 * 1000);
  assert.equal(MAX_ATTEMPTS_PER_CODE, 5);
});

// ── email ────────────────────────────────────────────────

test("the code email leads with the code and escapes the school name", () => {
  const email = buildLoginCodeEmail({ code: "042917", schoolName: `St. <Mary's> & "Co"` });
  assert.equal(email.subject, LOGIN_CODE_SUBJECT);
  assert.ok(!email.subject.includes("042917"));
  assert.ok(email.text.startsWith("042917"));
  assert.match(email.text, /expires in 10 minutes/);
  assert.match(email.text, /If you didn't ask for this, you can ignore this email\./);
  assert.ok(email.html.includes("042917"));
  assert.ok(email.html.includes("St. &lt;Mary&#39;s&gt; &amp; &quot;Co&quot;"));
  assert.ok(!email.html.includes("<Mary"));
  assert.ok(!/href=/i.test(email.html), "no links");
  assert.ok(!/<img/i.test(email.html), "no tracking images");
});

test("escapeHtml covers the five HTML metacharacters", () => {
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
});

test("the sender comes from AUTH_EMAIL_FROM, then EMAIL_FROM", () => {
  const saved = { a: process.env.AUTH_EMAIL_FROM, b: process.env.EMAIL_FROM };
  try {
    delete process.env.AUTH_EMAIL_FROM;
    delete process.env.EMAIL_FROM;
    assert.equal(loginCodeFromAddress(), "AskMySchool <noreply@askmyschool.app>");
    process.env.EMAIL_FROM = "General <g@x.com>";
    assert.equal(loginCodeFromAddress(), "General <g@x.com>");
    process.env.AUTH_EMAIL_FROM = "Auth <a@x.com>";
    assert.equal(loginCodeFromAddress(), "Auth <a@x.com>");
  } finally {
    if (saved.a === undefined) delete process.env.AUTH_EMAIL_FROM;
    else process.env.AUTH_EMAIL_FROM = saved.a;
    if (saved.b === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = saved.b;
  }
});
