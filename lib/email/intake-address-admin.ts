import { generateInboundToken } from "@/lib/email/token";
import {
  INTAKE_ADDRESS_COLUMNS,
  toIntakeAddress,
  type IntakeAddress,
} from "@/lib/email/addresses";
import {
  isUuid,
  validateIntakeAddressInput,
  type IntakeAddressInput,
} from "@/lib/email/intake-address-config";

// What the intake-address server actions do (actions/intake-addresses.ts),
// with the database and the admin guard passed in so it can be tested. Every
// entry point re-authorizes against the school id it was handed and scopes
// every query to that school, so an id from another school does nothing. The
// db is the admin's own client: RLS (admins manage their school's addresses)
// still applies.
//
// Changing an address's settings only affects mail that arrives afterwards;
// documents already ingested keep the visibility they were given. Deleting
// one (migration 053) is a soft delete that never touches documents, and a
// deleted address is "not found" to everything here.

type DbError = { code?: string; message: string };
type Reply<T> = PromiseLike<{ data: T | null; error: DbError | null }>;

/** The slice of the Supabase query builder used here. */
export interface IntakeQuery extends Reply<unknown> {
  select(columns: string): IntakeQuery;
  eq(column: string, value: unknown): IntakeQuery;
  is(column: string, value: null): IntakeQuery;
  in(column: string, values: readonly unknown[]): IntakeQuery;
  contains(column: string, value: readonly unknown[]): IntakeQuery;
  order(column: string, options?: { ascending?: boolean }): IntakeQuery;
  range(from: number, to: number): IntakeQuery;
  single(): Reply<unknown>;
  maybeSingle(): Reply<unknown>;
}

export interface IntakeDb {
  from(table: string): {
    select(columns: string): IntakeQuery;
    insert(row: Record<string, unknown>): IntakeQuery;
    update(row: Record<string, unknown>): IntakeQuery;
  };
}

export interface IntakeAdminDeps {
  db: () => Promise<IntakeDb> | IntakeDb;
  requireAdmin: (schoolId: string) => Promise<{ userId: string } | { error: string }>;
  newToken?: () => string;
  audit?: (userId: string, action: string, id: string, details: unknown, schoolId: string) => void;
}

export type AddressResult = { address: IntakeAddress } | { error: string };

function friendly(error: DbError): string {
  if (error.code === "23503") return "That folder no longer exists.";
  if (error.code === "42501") return "You do not have permission to manage this school";
  return error.message;
}

/** The folder must be one of this school's. */
async function checkFolder(db: IntakeDb, schoolId: string, folderId: string | null) {
  if (!folderId) return null;
  const { data, error } = await db
    .from("folders")
    .select("id")
    .eq("id", folderId)
    .eq("school_id", schoolId)
    .maybeSingle();
  if (error) return friendly(error);
  return data ? null : "That folder no longer exists.";
}

async function loadAddress(db: IntakeDb, schoolId: string, addressId: string) {
  if (!isUuid(addressId)) return { error: "Address not found." } as const;
  const { data, error } = await db
    .from("email_ingestion_addresses")
    .select(INTAKE_ADDRESS_COLUMNS)
    .eq("id", addressId)
    .eq("school_id", schoolId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { error: friendly(error) } as const;
  if (!data) return { error: "Address not found." } as const;
  return { address: toIntakeAddress(data as never) } as const;
}

/** Add a mailing-list address with a fresh, unguessable token. */
export async function createIntakeAddressCore(
  deps: IntakeAdminDeps,
  schoolId: string,
  input: IntakeAddressInput
): Promise<AddressResult> {
  const auth = await deps.requireAdmin(schoolId);
  if ("error" in auth) return auth;
  const valid = validateIntakeAddressInput(input, { labelRequired: true });
  if ("error" in valid) return valid;

  const db = await deps.db();
  const folderError = await checkFolder(db, schoolId, valid.fields.default_folder_id);
  if (folderError) return { error: folderError };

  const newToken = deps.newToken ?? generateInboundToken;
  // Tokens are unique across schools; a clash (48 random bits) just retries.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await db
      .from("email_ingestion_addresses")
      .insert({
        school_id: schoolId,
        kind: "list",
        division_id: null,
        token: newToken(),
        enabled: true,
        ...valid.fields,
      })
      .select(INTAKE_ADDRESS_COLUMNS)
      .single();
    if (error?.code === "23505") continue;
    if (error || !data) return { error: friendly(error ?? { message: "Could not add the address." }) };
    const address = toIntakeAddress(data as never);
    deps.audit?.(auth.userId, "create_intake_address", address.id, valid.fields, schoolId);
    return { address };
  }
  return { error: "Could not create a unique address. Try again." };
}

/** Rename an address or change who it's for, who may send, or its folder. */
export async function updateIntakeAddressCore(
  deps: IntakeAdminDeps,
  schoolId: string,
  addressId: string,
  input: IntakeAddressInput
): Promise<AddressResult> {
  const auth = await deps.requireAdmin(schoolId);
  if ("error" in auth) return auth;
  const db = await deps.db();
  const current = await loadAddress(db, schoolId, addressId);
  if ("error" in current) return current;

  const valid = validateIntakeAddressInput(input, {
    labelRequired: current.address.kind === "list",
  });
  if ("error" in valid) return valid;
  const folderError = await checkFolder(db, schoolId, valid.fields.default_folder_id);
  if (folderError) return { error: folderError };

  return saveAddress(deps, db, auth.userId, schoolId, addressId, {
    ...valid.fields,
    updated_at: new Date().toISOString(),
  });
}

/** Switch an address on or off. Mail to a switched-off address is turned away. */
export async function setIntakeAddressEnabledCore(
  deps: IntakeAdminDeps,
  schoolId: string,
  addressId: string,
  enabled: boolean
): Promise<AddressResult> {
  const auth = await deps.requireAdmin(schoolId);
  if ("error" in auth) return auth;
  if (typeof enabled !== "boolean") return { error: "Choose on or off." };
  const db = await deps.db();
  const current = await loadAddress(db, schoolId, addressId);
  if ("error" in current) return current;
  return saveAddress(deps, db, auth.userId, schoolId, addressId, {
    enabled,
    updated_at: new Date().toISOString(),
  });
}

const WHOLE_SCHOOL_NOT_DELETABLE =
  "The whole-school address can't be deleted. Switch it off instead.";

const INGESTION_PAGE = 1000;
const DOCUMENT_CHUNK = 100;

/**
 * How many documents an address brought in that are still in the library:
 * the distinct documents of this school's accepted ingestions that record
 * the address (email_ingestions.intake_address_ids, migration 053). Mail
 * from before that was recorded isn't counted.
 */
async function countAddressDocuments(
  db: IntakeDb,
  schoolId: string,
  addressId: string
): Promise<{ count: number } | { error: string }> {
  const ids = new Set<string>();
  for (let from = 0; ; from += INGESTION_PAGE) {
    const { data, error } = await db
      .from("email_ingestions")
      .select("document_ids")
      .eq("school_id", schoolId)
      .eq("status", "accepted")
      .contains("intake_address_ids", [addressId])
      .order("id")
      .range(from, from + INGESTION_PAGE - 1);
    if (error) return { error: friendly(error) };
    const rows = (data ?? []) as { document_ids: string[] | null }[];
    for (const row of rows) for (const id of row.document_ids ?? []) ids.add(id);
    if (rows.length < INGESTION_PAGE) break;
  }

  // Only documents that still exist (an admin may have deleted some).
  const all = [...ids];
  let count = 0;
  for (let i = 0; i < all.length; i += DOCUMENT_CHUNK) {
    const { data, error } = await db
      .from("documents")
      .select("id")
      .eq("school_id", schoolId)
      .in("id", all.slice(i, i + DOCUMENT_CHUNK));
    if (error) return { error: friendly(error) };
    count += ((data ?? []) as unknown[]).length;
  }
  return { count };
}

/** What the delete dialog shows: how many documents the address brought in. */
export async function getIntakeAddressDeleteInfoCore(
  deps: IntakeAdminDeps,
  schoolId: string,
  addressId: string
): Promise<{ documentCount: number } | { error: string }> {
  const auth = await deps.requireAdmin(schoolId);
  if ("error" in auth) return auth;
  const db = await deps.db();
  const current = await loadAddress(db, schoolId, addressId);
  if ("error" in current) return { error: current.error! };
  if (current.address.kind === "school") return { error: WHOLE_SCHOOL_NOT_DELETABLE };
  const counted = await countAddressDocuments(db, schoolId, addressId);
  if ("error" in counted) return counted;
  return { documentCount: counted.count };
}

/**
 * Delete a mailing-list or division address. A soft delete: the row is
 * marked deleted and switched off (so a path that ignores deleted_at still
 * turns its mail away), keeps its token and its slot (so a division's isn't
 * created again), and no document is touched — what it brought in keeps
 * its own visibility, folder and divisions. The whole-school address can
 * only be switched off: it's the default for the Gmail and manual intake,
 * and would be created again.
 */
export async function deleteIntakeAddressCore(
  deps: IntakeAdminDeps,
  schoolId: string,
  addressId: string
): Promise<{ success: true } | { error: string }> {
  const auth = await deps.requireAdmin(schoolId);
  if ("error" in auth) return auth;
  const db = await deps.db();
  const current = await loadAddress(db, schoolId, addressId);
  if ("error" in current) return { error: current.error! };
  const { address } = current;
  if (address.kind === "school") return { error: WHOLE_SCHOOL_NOT_DELETABLE };

  const counted = await countAddressDocuments(db, schoolId, addressId);
  if ("error" in counted) return counted;

  const now = new Date().toISOString();
  const { data, error } = await db
    .from("email_ingestion_addresses")
    .update({ deleted_at: now, deleted_by: auth.userId, enabled: false, updated_at: now })
    .eq("id", addressId)
    .eq("school_id", schoolId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();
  if (error) return { error: friendly(error) };
  if (!data) return { error: "Address not found." };
  deps.audit?.(
    auth.userId,
    "delete_intake_address",
    addressId,
    {
      token: address.token,
      label: address.label,
      kind: address.kind,
      visible_grades: address.visibleGrades,
      document_count: counted.count,
    },
    schoolId
  );
  return { success: true };
}

async function saveAddress(
  deps: IntakeAdminDeps,
  db: IntakeDb,
  userId: string,
  schoolId: string,
  addressId: string,
  changes: Record<string, unknown>
): Promise<AddressResult> {
  const { data, error } = await db
    .from("email_ingestion_addresses")
    .update(changes)
    .eq("id", addressId)
    .eq("school_id", schoolId)
    .is("deleted_at", null)
    .select(INTAKE_ADDRESS_COLUMNS)
    .maybeSingle();
  if (error || !data) return { error: friendly(error ?? { message: "Address not found." }) };
  deps.audit?.(userId, "update_intake_address", addressId, changes, schoolId);
  return { address: toIntakeAddress(data as never) };
}
