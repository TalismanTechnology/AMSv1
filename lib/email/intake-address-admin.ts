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
// documents already ingested keep the visibility they were given.

type DbError = { code?: string; message: string };
type Reply<T> = PromiseLike<{ data: T | null; error: DbError | null }>;

/** The slice of the Supabase query builder used here. */
export interface IntakeDb {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: unknown): {
        eq(column: string, value: unknown): {
          maybeSingle(): Reply<Record<string, unknown>>;
        };
      };
    };
    insert(row: Record<string, unknown>): {
      select(columns: string): { single(): Reply<Record<string, unknown>> };
    };
    update(row: Record<string, unknown>): {
      eq(column: string, value: unknown): {
        eq(column: string, value: unknown): {
          select(columns: string): { single(): Reply<Record<string, unknown>> };
        };
      };
    };
    delete(): {
      eq(column: string, value: unknown): {
        eq(column: string, value: unknown): Reply<unknown>;
      };
    };
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

/**
 * Delete a mailing-list address. The whole-school and division addresses
 * can be switched off but not deleted (a division's goes with its division).
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
  if (current.address.kind !== "list") {
    return { error: "This address can't be deleted. Switch it off instead." };
  }
  const { error } = await db
    .from("email_ingestion_addresses")
    .delete()
    .eq("id", addressId)
    .eq("school_id", schoolId);
  if (error) return { error: friendly(error) };
  deps.audit?.(auth.userId, "delete_intake_address", addressId, { token: current.address.token }, schoolId);
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
    .select(INTAKE_ADDRESS_COLUMNS)
    .single();
  if (error || !data) return { error: friendly(error ?? { message: "Address not found." }) };
  deps.audit?.(userId, "update_intake_address", addressId, changes, schoolId);
  return { address: toIntakeAddress(data as never) };
}
