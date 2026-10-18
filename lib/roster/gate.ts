import { createAdminClient } from "@/lib/supabase/admin";
import { getRosterEntry } from "./store";

// Optional per-school gate (schools.require_roster_match, migration 044,
// default off): parents must also be on the school's uploaded roster, however
// they sign in. Checked by the Blackbaud and Veracross callbacks after the
// provider has accepted the parent and before any account is touched; the
// roster provider is roster-only by construction.
//
// While the flag is off (or the column doesn't exist yet) nothing here can
// refuse anyone.

export type RosterLookup = "match" | "no_match" | "not_installed" | "error";

/** Reads the optional flag from a `select("*")` schools row. */
export function isRosterMatchRequired(
  school: { require_roster_match?: unknown } | null | undefined
): boolean {
  return school?.require_roster_match === true;
}

/**
 * Pure: may this parent continue? Not required → yes. Table missing → yes
 * (the flag can't really be on without migration 044). A failed lookup while
 * required refuses: the school asked for the check.
 */
export function decideRosterGate(required: boolean, lookup: RosterLookup): "pass" | "blocked" | "error" {
  if (!required) return "pass";
  if (lookup === "match" || lookup === "not_installed") return "pass";
  return lookup === "no_match" ? "blocked" : "error";
}

let loggedNotInstalled = false;

async function lookupRoster(schoolId: string, email: string): Promise<RosterLookup> {
  try {
    const result = await getRosterEntry(schoolId, email);
    if (!result.installed) {
      if (!loggedNotInstalled) {
        loggedNotInstalled = true;
        console.warn("Roster gate: school_roster is not installed (migration 044); gate treated as off.");
      }
      return "not_installed";
    }
    return result.entry ? "match" : "no_match";
  } catch (caught: unknown) {
    const message = caught instanceof Error ? caught.message : "Unknown error";
    console.error(`Roster gate lookup failed for school ${schoolId}: ${message}`);
    return "error";
  }
}

/** Active roster row exists for this email (or the roster isn't installed). */
export async function passesRosterGate(schoolId: string, email: string): Promise<boolean> {
  return decideRosterGate(true, await lookupRoster(schoolId, email)) === "pass";
}

export type RosterGateResult =
  | { outcome: "pass" }
  | { outcome: "blocked"; schoolName: string }
  | { outcome: "error" };

/**
 * The whole check for the provider callbacks. Loads the school itself
 * (`select("*")`, so it works before 044); if that read fails the gate is
 * treated as not required, so a school that never turned it on sees no new
 * failure mode.
 */
export async function checkRosterGate(schoolId: string, email: string): Promise<RosterGateResult> {
  let school: { name?: string | null; require_roster_match?: unknown } | null = null;

  try {
    const { data, error } = await createAdminClient()
      .from("schools")
      .select("*")
      .eq("id", schoolId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    school = data;
  } catch (caught: unknown) {
    const message = caught instanceof Error ? caught.message : "Unknown error";
    console.error(`Roster gate: could not load school ${schoolId}; treated as not required: ${message}`);
    return { outcome: "pass" };
  }

  if (!isRosterMatchRequired(school)) return { outcome: "pass" };

  const outcome = decideRosterGate(true, await lookupRoster(schoolId, email));
  if (outcome === "blocked") {
    return { outcome, schoolName: school?.name?.trim() || "your school" };
  }
  return { outcome };
}

export function rosterGateMessage(schoolName: string): string {
  return `Your email isn't on ${schoolName}'s parent list for AskMySchool yet. Please contact the school office.`;
}
