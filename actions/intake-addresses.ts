"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSchoolAdmin } from "@/lib/auth/require-school-admin";
import { logAudit } from "@/lib/audit";
import {
  createIntakeAddressCore,
  deleteIntakeAddressCore,
  getIntakeAddressDeleteInfoCore,
  setIntakeAddressEnabledCore,
  updateIntakeAddressCore,
  type AddressResult,
  type IntakeAdminDeps,
  type IntakeDb,
} from "@/lib/email/intake-address-admin";
import type { IntakeAddressInput } from "@/lib/email/intake-address-config";

// Admin > Email intake: the school's intake addresses (migration 051). The
// logic and validation live in lib/email/intake-address-admin.ts; these only
// supply the admin's client, the shared admin guard (which also applies the
// school owner lock) and the audit log.

const deps: IntakeAdminDeps = {
  db: async () => (await createClient()) as unknown as IntakeDb,
  requireAdmin: requireSchoolAdmin,
  audit: (userId, action, id, details, schoolId) =>
    logAudit(userId, action, "email_ingestion_address", id, details as Record<string, unknown>, schoolId),
};

function revalidated<T extends object>(result: T): T {
  if (!("error" in result)) revalidatePath("/", "layout");
  return result;
}

export async function createIntakeAddress(
  schoolId: string,
  input: IntakeAddressInput
): Promise<AddressResult> {
  return revalidated(await createIntakeAddressCore(deps, schoolId, input));
}

export async function updateIntakeAddress(
  schoolId: string,
  addressId: string,
  input: IntakeAddressInput
): Promise<AddressResult> {
  return revalidated(await updateIntakeAddressCore(deps, schoolId, addressId, input));
}

export async function setIntakeAddressEnabled(
  schoolId: string,
  addressId: string,
  enabled: boolean
): Promise<AddressResult> {
  return revalidated(await setIntakeAddressEnabledCore(deps, schoolId, addressId, enabled));
}

/** For the delete dialog: how many documents came in through the address. */
export async function getIntakeAddressDeleteInfo(
  schoolId: string,
  addressId: string
): Promise<{ documentCount: number } | { error: string }> {
  return getIntakeAddressDeleteInfoCore(deps, schoolId, addressId);
}

export async function deleteIntakeAddress(
  schoolId: string,
  addressId: string
): Promise<{ success: true } | { error: string }> {
  return revalidated(await deleteIntakeAddressCore(deps, schoolId, addressId));
}
