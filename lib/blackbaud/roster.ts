import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { skyFetch } from "./client";
import { normalizeEmail } from "./crypto";

// Pulls a school's parent/guardian records from the SKY School API into
// blackbaud_roster. Login-time verification reads that local table rather than
// calling Blackbaud per attempt — the API is rate limited and a login should
// not depend on a third party being up.

const PAGE_SIZE = 1000;
const MAX_PAGES = 200; // ~200k users; a guard against a broken marker looping forever

// Role names that indicate a parent/guardian. Blackbaud role ids are per
// environment, so we resolve names -> ids at sync time instead of hardcoding.
const PARENT_ROLE_PATTERN = /parent|guardian/i;

// Blackbaud returns far more per user than we store. Passthrough everything and
// pick the few fields we need — a new field upstream must not break the sync.
const roleSchema = z.object({
  id: z.union([z.number(), z.string()]),
  name: z.string().optional(),
  base_role_id: z.union([z.number(), z.string()]).optional(),
});

const rolesResponseSchema = z.object({
  value: z.array(roleSchema).default([]),
});

const userSchema = z.object({
  id: z.union([z.number(), z.string()]),
  email: z.string().nullish(),
  first_name: z.string().nullish(),
  last_name: z.string().nullish(),
  preferred_name: z.string().nullish(),
});

const usersResponseSchema = z.object({
  count: z.number().optional(),
  value: z.array(userSchema).default([]),
});

export interface SyncResult {
  schoolId: string;
  upserted: number;
  deactivated: number;
  rolesUsed: string[];
}

async function resolveParentRoleIds(schoolId: string): Promise<string[]> {
  const raw = await skyFetch<unknown>(schoolId, "/school/v1/roles");
  const parsed = rolesResponseSchema.parse(raw);

  return parsed.value
    .filter((role) => role.name && PARENT_ROLE_PATTERN.test(role.name))
    .map((role) => String(role.base_role_id ?? role.id));
}

async function fetchRosterPage(
  schoolId: string,
  roleIds: string[],
  marker: string | null
): Promise<z.infer<typeof usersResponseSchema>> {
  const searchParams: Record<string, string> = {
    base_role_ids: roleIds.join(","),
    page_size: String(PAGE_SIZE),
  };

  if (marker) {
    searchParams.marker = marker;
  }

  const raw = await skyFetch<unknown>(schoolId, "/school/v1/users/extended", {
    searchParams,
  });

  return usersResponseSchema.parse(raw);
}

/**
 * Sync one school's parent roster.
 *
 * Fetches every page before writing anything. A mid-sync failure therefore
 * throws without touching the existing roster — a partial write would silently
 * lock out the parents whose pages hadn't loaded yet, which is worse than
 * serving a roster that is a day stale.
 */
export async function syncRoster(schoolId: string): Promise<SyncResult> {
  const roleIds = await resolveParentRoleIds(schoolId);

  if (roleIds.length === 0) {
    throw new Error(
      `No parent/guardian roles found in Blackbaud for school ${schoolId}`
    );
  }

  const collected = new Map<string, z.infer<typeof userSchema>>();
  let marker: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const response: z.infer<typeof usersResponseSchema> = await fetchRosterPage(
      schoolId,
      roleIds,
      marker
    );

    if (response.value.length === 0) {
      break;
    }

    for (const user of response.value) {
      collected.set(String(user.id), user);
    }

    if (response.value.length < PAGE_SIZE) {
      break;
    }

    const nextMarker = String(response.value[response.value.length - 1].id);

    // A marker that doesn't advance means the API is repeating a page; bail
    // rather than spin until MAX_PAGES.
    if (nextMarker === marker) {
      break;
    }

    marker = nextMarker;
  }

  const rows = [...collected.values()]
    .filter((user) => Boolean(user.email))
    .map((user) => ({
      school_id: schoolId,
      bb_user_id: String(user.id),
      email: normalizeEmail(user.email as string),
      first_name: user.preferred_name ?? user.first_name ?? null,
      last_name: user.last_name ?? null,
      roles: roleIds,
      is_active: true,
      synced_at: new Date().toISOString(),
    }));

  const supabase = createAdminClient();
  const syncStartedAt = new Date().toISOString();

  if (rows.length > 0) {
    const { error } = await supabase
      .from("blackbaud_roster")
      .upsert(rows, { onConflict: "school_id,bb_user_id" });

    if (error) {
      throw new Error(`Roster upsert failed: ${error.message}`);
    }
  }

  // Anyone not touched by this sync is no longer a parent in Blackbaud (removed,
  // role changed, email cleared). Deactivate rather than delete so we keep the
  // record for auditing why someone lost access.
  const { data: deactivated, error: deactivateError } = await supabase
    .from("blackbaud_roster")
    .update({ is_active: false })
    .eq("school_id", schoolId)
    .eq("is_active", true)
    .lt("synced_at", syncStartedAt)
    .select("id");

  if (deactivateError) {
    throw new Error(`Roster deactivation failed: ${deactivateError.message}`);
  }

  await supabase
    .from("blackbaud_connections")
    .update({
      last_synced_at: new Date().toISOString(),
      last_error: null,
      status: "connected",
      updated_at: new Date().toISOString(),
    })
    .eq("school_id", schoolId);

  return {
    schoolId,
    upserted: rows.length,
    deactivated: deactivated?.length ?? 0,
    rolesUsed: roleIds,
  };
}

/**
 * Look up a verified parent by email. Returns null when the school has no
 * matching active roster entry — callers must not leak which case occurred.
 */
export async function findRosterMatch(schoolId: string, email: string) {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("blackbaud_roster")
    .select("bb_user_id, email, first_name, last_name")
    .eq("school_id", schoolId)
    .eq("email", normalizeEmail(email))
    .eq("is_active", true)
    .maybeSingle();

  return data;
}
