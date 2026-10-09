import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthProvider, type AuthProvider } from "@/lib/auth/provider";
import { getVeracrossConnection } from "@/lib/veracross/connection";

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
 * schools whose admin has connected Blackbaud, and Veracross schools with an
 * enabled Veracross OAuth Application. Blackbaud sign-in needs only the
 * connection's environment id (the parent's own token does the rest), so an
 * expired admin token doesn't hide the school.
 */
export async function getSignInSchools(): Promise<SignInSchool[]> {
  const admin = createAdminClient();

  // `schools(*)`, not a column list: auth_provider only exists once migration
  // 034 is applied, and naming it would break this query before then.
  const [blackbaud, veracross] = await Promise.all([
    admin
      .from("blackbaud_connections")
      .select("school_id, environment_id, schools(*)")
      .not("environment_id", "is", null),
    admin
      .from("veracross_connections")
      .select("school_id, schools(*)")
      .eq("enabled", true),
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

  return Array.from(schools.values()).sort((a, b) => a.name.localeCompare(b.name));
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

/** Which provider a school uses, and whether its parents can sign in yet. */
export async function getSchoolSignIn(school: {
  id: string;
  auth_provider?: string | null;
}): Promise<{ provider: AuthProvider; enabled: boolean }> {
  const provider = resolveAuthProvider(school.auth_provider);

  const enabled =
    provider === "veracross"
      ? Boolean(await getVeracrossConnection(school.id))
      : Boolean(await getSchoolEnvironmentId(school.id));

  return { provider, enabled };
}
