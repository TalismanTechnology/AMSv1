import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthProvider, type AuthProvider } from "@/lib/auth/provider";
import { getVeracrossConnection } from "@/lib/veracross/connection";
import { getRosterSummary } from "@/lib/roster/store";

export interface SignInSchool {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  provider: AuthProvider;
}

interface SchoolRow {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  auth_provider?: string | null;
}

function toSignInSchool(school: SchoolRow, provider: AuthProvider): SignInSchool {
  return {
    id: school.id,
    name: school.name,
    slug: school.slug,
    logoUrl: school.logo_url,
    provider,
  };
}

/**
 * Schools a parent can pick on the "Choose your school" screen: Blackbaud
 * schools whose admin has connected Blackbaud, Veracross schools with an
 * enabled Veracross OAuth Application, and roster schools with at least one
 * active parent on their uploaded roster. Blackbaud sign-in needs only the
 * connection's environment id (the parent's own token does the rest), so an
 * expired admin token doesn't hide the school.
 */
export async function getSignInSchools(): Promise<SignInSchool[]> {
  const admin = createAdminClient();

  // `schools(*)`, not a column list: auth_provider only exists once migration
  // 034 is applied, and naming it would break this query before then.
  const [blackbaud, veracross, roster] = await Promise.all([
    admin
      .from("blackbaud_connections")
      .select("school_id, environment_id, schools(*)")
      .not("environment_id", "is", null),
    admin
      .from("veracross_connections")
      .select("school_id, schools(*)")
      .eq("enabled", true),
    getRosterSignInSchools(),
  ]);

  if (blackbaud.error) {
    throw new Error(`Failed to load sign-in schools: ${blackbaud.error.message}`);
  }

  // Missing table (034 not applied) just means no Veracross schools yet.
  if (veracross.error) {
    console.error(`Could not load Veracross sign-in schools: ${veracross.error.message}`);
  }

  const schools = new Map<string, SignInSchool>();

  for (const row of blackbaud.data ?? []) {
    const school = row.schools as unknown as SchoolRow | null;
    if (school && resolveAuthProvider(school.auth_provider) === "blackbaud") {
      schools.set(school.id, toSignInSchool(school, "blackbaud"));
    }
  }

  for (const row of veracross.error ? [] : (veracross.data ?? [])) {
    const school = row.schools as unknown as SchoolRow | null;
    if (school && resolveAuthProvider(school.auth_provider) === "veracross") {
      schools.set(school.id, toSignInSchool(school, "veracross"));
    }
  }
  for (const school of roster) {
    schools.set(school.id, toSignInSchool(school, "roster"));
  }

  return Array.from(schools.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Roster schools whose roster has active parents. Before migration 045 no
 * school can be one, and any failure here just leaves them off the list.
 */
async function getRosterSignInSchools(): Promise<SchoolRow[]> {
  try {
    const { data, error } = await createAdminClient()
      .from("schools")
      .select("*")
      .eq("auth_provider", "roster");
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as SchoolRow[];
    const ready = await Promise.all(
      rows.map(async (school) => {
        return isRosterReady(await getRosterSummary(school.id)) ? school : null;
      })
    );
    return ready.filter((school): school is SchoolRow => school !== null);
  } catch (caught: unknown) {
    const message = caught instanceof Error ? caught.message : "Unknown error";
    console.error(`Could not load roster sign-in schools: ${message}`);
    return [];
  }
}

/** The environment a school's parents must sign in to, or null if not connected. */
export async function getSchoolEnvironmentId(schoolId: string): Promise<string | null> {
  const admin = createAdminClient();

  const { data } = await admin
    .from("blackbaud_connections")
    .select("environment_id")
    .eq("school_id", schoolId)
    .maybeSingle();

  return data?.environment_id ?? null;
}

/** A roster school can take sign-ins once 045 is applied and someone is active on it. */
function isRosterReady(summary: Awaited<ReturnType<typeof getRosterSummary>>): boolean {
  return summary.installed && summary.activeCount > 0;
}

/** Injectable lookups for getSchoolSignIn; tests pass fakes, production uses the real ones. */
export interface SchoolSignInDeps {
  getVeracrossConnection?: (schoolId: string) => Promise<unknown>;
  getSchoolEnvironmentId?: (schoolId: string) => Promise<string | null>;
  getRosterSummary?: typeof getRosterSummary;
}

/** Which provider a school uses, and whether its parents can sign in yet. */
export async function getSchoolSignIn(
  school: {
    id: string;
    auth_provider?: string | null;
  },
  deps: SchoolSignInDeps = {}
): Promise<{ provider: AuthProvider; enabled: boolean }> {
  const provider = resolveAuthProvider(school.auth_provider);

  const enabled =
    provider === "veracross"
      ? Boolean(await (deps.getVeracrossConnection ?? getVeracrossConnection)(school.id))
      : provider === "roster"
        ? await (deps.getRosterSummary ?? getRosterSummary)(school.id).then(isRosterReady, (caught: unknown) => {
            // Fail closed like the other providers rather than break the login page.
            const message = caught instanceof Error ? caught.message : "Unknown error";
            console.error(`Could not check roster sign-in: ${message}`);
            return false;
          })
        : Boolean(await (deps.getSchoolEnvironmentId ?? getSchoolEnvironmentId)(school.id));

  return { provider, enabled };
}
