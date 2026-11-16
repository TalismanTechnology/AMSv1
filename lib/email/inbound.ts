// Pure helpers for inbound-email ingestion. Kept side-effect free so they
// can be unit tested without a mail provider or database.

import { isForAllParents, mergeVisibleGrades } from "@/lib/documents/grade-visibility";

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
 * True when a 'processing' claim is old enough that the attempt holding it
 * must have died (the webhook's maxDuration is 300s), so a retry may take it
 * over instead of being turned away as a duplicate forever.
 */
export const STALE_CLAIM_MS = 10 * 60 * 1000;

export function isStaleClaim(createdAt: string, now: Date = new Date()): boolean {
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return true;
  return now.getTime() - created > STALE_CLAIM_MS;
}

/**
 * Find every inbound token (the local part of the address) among the
 * recipients on the configured inbound domain, in order and without repeats.
 * e.g. ["ams-ab12cd@inbound.askmyschool.com"] with domain
 * "inbound.askmyschool.com" -> ["ams-ab12cd"].
 */
export function extractInboundTokens(
  recipients: string[],
  inboundDomain: string
): string[] {
  const domain = inboundDomain.trim().toLowerCase();
  if (!domain) return [];

  const tokens: string[] = [];
  for (const recipient of recipients) {
    const addr = parseEmailAddress(recipient);
    if (!addr) continue;
    const atIndex = addr.lastIndexOf("@");
    const local = addr.slice(0, atIndex);
    const dom = addr.slice(atIndex + 1);
    if (dom === domain && local && !tokens.includes(local)) tokens.push(local);
  }
  return tokens;
}

/**
 * A school's inbound address; division_id is null for the whole-school one
 * and for mailing-list addresses. The settings (migration 051) are optional
 * so a row without them behaves as every address did before: on, any
 * sender, all parents, no folder. deleted_at (migration 053) is set on an
 * address an admin deleted; its mail is turned away.
 */
export interface InboundAddress {
  id?: string;
  token: string;
  school_id: string;
  division_id: string | null;
  kind?: "school" | "division" | "list" | null;
  label?: string | null;
  enabled?: boolean | null;
  visible_grades?: string[] | null;
  allowed_senders?: string[] | null;
  default_folder_id?: string | null;
  deleted_at?: string | null;
}

/**
 * Decide which school a message belongs to and which divisions it is for,
 * from the inbound addresses it reached. The first known address picks the
 * school, and the message is for every division of that school whose address
 * it reached. The whole-school address adds no division, so mail sent to it
 * and to the Upper School address is still marked Upper School.
 */
export function routeInboundMessage(
  tokens: string[],
  addresses: InboundAddress[]
): { schoolId: string; divisionIds: string[] } | null {
  const reached = reachedAddresses(tokens, addresses);
  if (!reached.length) return null;
  return { schoolId: reached[0].school_id, divisionIds: divisionsOf(reached) };
}

/**
 * The known addresses a message reached, in recipient order, keeping to the
 * first school's (the one routeInboundMessage picks).
 */
export function reachedAddresses(
  tokens: string[],
  addresses: InboundAddress[]
): InboundAddress[] {
  const byToken = new Map(addresses.map((a) => [a.token, a]));
  const reached = tokens
    .map((token) => byToken.get(token))
    .filter((a): a is InboundAddress => !!a);
  return reached.filter((a) => a.school_id === reached[0]?.school_id);
}

function divisionsOf(addresses: InboundAddress[]): string[] {
  const divisionIds: string[] = [];
  for (const address of addresses) {
    if (address.division_id && !divisionIds.includes(address.division_id)) {
      divisionIds.push(address.division_id);
    }
  }
  return divisionIds;
}

/** What an address is called in logs and the admin UI. */
export function addressName(address: InboundAddress): string {
  const label = address.label?.trim();
  if (label) return label;
  if (address.kind === "list") return address.token;
  return address.division_id ? "Division address" : "Whole-school address";
}

/**
 * Does an address's sender rule let `from` in? No rule (null or empty) lets
 * everyone in, as before. Entries are full addresses ("office@school.org")
 * or domains ("school.org" or "@school.org"), a domain also covering its
 * subdomains ("mail.school.org").
 */
export function senderAllowed(
  fromAddress: string | null,
  allowedSenders: readonly string[] | null | undefined
): boolean {
  const rules = (allowedSenders ?? []).map((r) => r.trim().toLowerCase()).filter(Boolean);
  if (!rules.length) return true;
  const from = fromAddress?.trim().toLowerCase();
  if (!from || !from.includes("@")) return false;
  const domain = from.slice(from.lastIndexOf("@") + 1);
  return rules.some((rule) => {
    if (rule.includes("@") && !rule.startsWith("@")) return rule === from;
    const ruleDomain = rule.replace(/^@/, "");
    return domain === ruleDomain || domain.endsWith(`.${ruleDomain}`);
  });
}

/** What the reached addresses decide for a message, once its school is known. */
export type AddressDecision =
  | {
      accepted: true;
      /** Divisions of the addresses that took the message. */
      divisionIds: string[];
      /** Who may see the documents: null = all parents. */
      visibleGrades: string[] | null;
      /** Folder to file the documents in, if an address has one. */
      folderId: string | null;
      /** The addresses that took the message. */
      addresses: InboundAddress[];
    }
  | { accepted: false; status: "rejected_disabled" | "rejected_domain"; reason: string };

/**
 * Apply the reached addresses' own settings (migration 051). Deleted and
 * switched-off addresses are ignored, as are those whose sender rule turns
 * the sender away; the message is taken if any address is left, and
 * rejected otherwise: as rejected_disabled when every address was deleted
 * or off (never falling back to another address), else rejected_domain.
 * The addresses that took it decide the divisions, the audience (all
 * parents if any of them is for all parents, else every grade any of them
 * names) and the folder (the first that has one).
 */
export function applyAddressRules(
  reached: InboundAddress[],
  fromAddress: string | null
): AddressDecision {
  const enabled = reached.filter((a) => !a.deleted_at && a.enabled !== false);
  if (!enabled.length) {
    const deleted = reached.filter((a) => a.deleted_at);
    const off = reached.filter((a) => !a.deleted_at);
    const reason = [
      deleted.length ? `Address deleted: ${deleted.map(addressName).join(", ")}` : "",
      off.length ? `Address switched off: ${off.map(addressName).join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("; ");
    return { accepted: false, status: "rejected_disabled", reason };
  }
  const taking = enabled.filter((a) => senderAllowed(fromAddress, a.allowed_senders));
  if (!taking.length) {
    const names = enabled.map(addressName).join(", ");
    return {
      accepted: false,
      status: "rejected_domain",
      reason: `Sender ${fromAddress ?? "unknown"} isn't allowed for ${names}`,
    };
  }

  let visibleGrades: string[] | null = taking[0].visible_grades ?? null;
  for (const address of taking.slice(1)) {
    visibleGrades = mergeVisibleGrades(visibleGrades, address.visible_grades);
  }
  return {
    accepted: true,
    divisionIds: divisionsOf(taking),
    visibleGrades: isForAllParents(visibleGrades) ? null : visibleGrades,
    folderId: taking.find((a) => a.default_folder_id)?.default_folder_id ?? null,
    addresses: taking,
  };
}
