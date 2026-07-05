import { randomBytes } from "crypto";

/**
 * Generate a unique-ish inbound address token. Forms the local part of a
 * school's inbound email address: `<token>@<INBOUND_EMAIL_DOMAIN>`.
 * 12 hex chars (48 bits) is ample for per-school address uniqueness and is
 * hard to guess, which also gates spoofed mail to unknown addresses.
 */
export function generateInboundToken(): string {
  return "ams-" + randomBytes(6).toString("hex");
}
