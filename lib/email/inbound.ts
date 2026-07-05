// Pure helpers for inbound-email ingestion. Kept side-effect free so they
// can be unit tested without a mail provider or database.

const DOMAIN_RE =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/**
 * Normalize + validate a sender domain (strips a leading "@" or "*.").
 * Returns null when the input is not a syntactically valid domain.
 */
export function normalizeSenderDomain(input: string): string | null {
  const domain = input.trim().toLowerCase().replace(/^[@*]+\.?/, "");
  return DOMAIN_RE.test(domain) ? domain : null;
}

/**
 * Extract a bare, lowercased email address from a header value that may be
 * "Display Name <addr@example.com>" or just "addr@example.com".
 */
export function parseEmailAddress(from: string): string | null {
  if (!from) return null;
  const angle = from.match(/<([^>]+)>/);
  const raw = (angle ? angle[1] : from).trim().toLowerCase();
  return raw.includes("@") ? raw : null;
}

/**
 * True when the sender's address ends with one of the allowed domain
 * suffixes. Matches the exact domain and any subdomain of it:
 *   allowed "lincolnhigh.org" matches a@lincolnhigh.org and a@mail.lincolnhigh.org.
 * A leading "@" on an allowed entry is tolerated.
 */
export function senderDomainAllowed(
  fromAddress: string | null,
  allowedDomains: string[]
): boolean {
  if (!fromAddress) return false;
  const addr = fromAddress.trim().toLowerCase();
  if (!addr.includes("@")) return false;

  return allowedDomains.some((entry) => {
    const suffix = entry.trim().toLowerCase().replace(/^@+/, "");
    if (!suffix) return false;
    return addr.endsWith("@" + suffix) || addr.endsWith("." + suffix);
  });
}

/**
 * Find the inbound token (the local part of the address) from the recipient
 * list for messages sent to the configured inbound domain.
 * e.g. to=["ams-ab12cd@inbound.askmyschool.com"] with domain
 * "inbound.askmyschool.com" -> "ams-ab12cd".
 */
export function extractInboundToken(
  recipients: string[],
  inboundDomain: string
): string | null {
  const domain = inboundDomain.trim().toLowerCase();
  if (!domain) return null;

  for (const recipient of recipients) {
    const addr = parseEmailAddress(recipient);
    if (!addr) continue;
    const atIndex = addr.lastIndexOf("@");
    const local = addr.slice(0, atIndex);
    const dom = addr.slice(atIndex + 1);
    if (dom === domain && local) return local;
  }
  return null;
}
