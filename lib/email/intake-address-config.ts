import { normalizeVisibleGrades } from "@/lib/documents/grade-visibility";

// Validation for an intake address's settings as an admin edits them
// (migration 051). Pure, shared by the server actions and their tests.

export const MAX_LABEL_LENGTH = 80;
export const MAX_ALLOWED_SENDERS = 50;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ADDRESS_RE = /^[^\s@]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const DOMAIN_RE = /^@?[a-z0-9-]+(\.[a-z0-9-]+)+$/;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** Trimmed label, or an error. Required for list addresses. */
export function normalizeLabel(
  input: unknown,
  required: boolean
): { label: string | null } | { error: string } {
  const label = typeof input === "string" ? input.trim().replace(/\s+/g, " ") : "";
  if (!label) return required ? { error: "Give the address a name." } : { label: null };
  if (label.length > MAX_LABEL_LENGTH) {
    return { error: `Keep the name under ${MAX_LABEL_LENGTH} characters.` };
  }
  return { label };
}

/**
 * Sender rule entries: full addresses or domains, lowercased, without
 * repeats. Accepts a list or text separated by commas, spaces or new lines.
 * Empty = any sender (null).
 */
export function normalizeAllowedSenders(
  input: unknown
): { senders: string[] | null } | { error: string } {
  if (input === null || input === undefined) return { senders: null };
  const raw = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.split(/[\s,;]+/)
      : null;
  if (!raw) return { error: "Allowed senders must be a list." };
  const entries = [
    ...new Set(
      raw
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
  const bad = entries.filter((e) => !ADDRESS_RE.test(e) && !DOMAIN_RE.test(e));
  if (bad.length) return { error: `Not an email address or domain: ${bad.join(", ")}` };
  if (entries.length > MAX_ALLOWED_SENDERS) {
    return { error: `Add at most ${MAX_ALLOWED_SENDERS} allowed senders.` };
  }
  return { senders: entries.length ? entries : null };
}

export interface IntakeAddressInput {
  label?: unknown;
  visibleGrades?: unknown;
  allowedSenders?: unknown;
  defaultFolderId?: unknown;
}

export interface IntakeAddressFields {
  label: string | null;
  visible_grades: string[] | null;
  allowed_senders: string[] | null;
  default_folder_id: string | null;
}

/** Every setting validated together; the first problem is the error. */
export function validateIntakeAddressInput(
  input: IntakeAddressInput,
  opts: { labelRequired: boolean }
): { fields: IntakeAddressFields } | { error: string } {
  const label = normalizeLabel(input.label, opts.labelRequired);
  if ("error" in label) return label;
  const grades = normalizeVisibleGrades(input.visibleGrades);
  if ("error" in grades) return grades;
  const senders = normalizeAllowedSenders(input.allowedSenders);
  if ("error" in senders) return senders;
  const folder = input.defaultFolderId;
  if (folder !== null && folder !== undefined && folder !== "" && !isUuid(folder)) {
    return { error: "Choose a folder from the list." };
  }
  return {
    fields: {
      label: label.label,
      visible_grades: grades.grades,
      allowed_senders: senders.senders,
      default_folder_id: isUuid(folder) ? folder : null,
    },
  };
}
