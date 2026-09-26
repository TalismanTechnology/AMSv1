import { createAdminClient } from "@/lib/supabase/admin";

export interface SignInSchool {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
}

/**
 * Schools a parent can pick on the "Choose your school" screen: those whose
 * admin has connected Blackbaud. Sign-in needs only the connection's
 * environment id (the parent's own token does the rest), so an expired admin
 * token doesn't hide the school.
 */
export async function getSignInSchools(): Promise<SignInSchool[]> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("blackbaud_connections")
    .select("school_id, environment_id, schools(id, name, slug, logo_url)")
    .not("environment_id", "is", null);

  if (error) {
    throw new Error(`Failed to load sign-in schools: ${error.message}`);
  }

  return (data ?? [])
    .map((row) => row.schools as unknown as {
      id: string;
      name: string;
      slug: string;
      logo_url: string | null;
    } | null)
    .filter((school): school is NonNullable<typeof school> => Boolean(school))
    .map((school) => ({
      id: school.id,
      name: school.name,
      slug: school.slug,
      logoUrl: school.logo_url,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
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
