import crypto from "node:crypto";

// Blackbaud refresh tokens are long-lived credentials to a school's own
// student/parent data. They are encrypted at the app layer so a database
// leak alone does not hand over API access to every connected school.

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12; // GCM standard

export interface EncryptedToken {
  ciphertext: string;
  iv: string;
  tag: string;
}

function getKey(): Buffer {
  const raw = process.env.BLACKBAUD_TOKEN_ENC_KEY;

  if (!raw) {
    throw new Error("BLACKBAUD_TOKEN_ENC_KEY not configured");
  }

  const key = Buffer.from(raw, "base64");

  if (key.length !== KEY_BYTES) {
    throw new Error(
      `BLACKBAUD_TOKEN_ENC_KEY must decode to ${KEY_BYTES} bytes, got ${key.length}`
    );
  }

  return key;
}

export function encryptToken(plaintext: string): EncryptedToken {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

// Throws if the ciphertext, IV, or tag has been tampered with — GCM
// authentication failure is surfaced, never silently returned as garbage.
export function decryptToken(encrypted: EncryptedToken): string {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(encrypted.iv, "base64")
  );

  decipher.setAuthTag(Buffer.from(encrypted.tag, "base64"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}

// Emails arrive from Blackbaud and from login forms with inconsistent casing
// and whitespace. Both sides must normalize identically or matching silently
// fails for legitimate parents.
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
