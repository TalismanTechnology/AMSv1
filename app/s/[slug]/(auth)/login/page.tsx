import { getSchoolBySlug } from "@/lib/school-context";
import { getSchoolEnvironmentId } from "@/lib/auth/sign-in-schools";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveSchoolName } from "@/lib/school-display-name";
import { notFound } from "next/navigation";
import { LoginForm } from "./login-form";

interface LoginPageProps {
  params: Promise<{ slug: string }>;
}

/**
 * The school's display name for the sign-in page. `schools.name` first, then
 * the admin-edited `settings.school_name` (read with the admin client: the
 * visitor isn't signed in yet). Null if neither holds a real name.
 */
async function loadSchoolName(schoolId: string, name: string | null | undefined) {
  const primary = resolveSchoolName(name);
  if (primary) return primary;

  const { data } = await createAdminClient()
    .from("settings")
    .select("school_name")
    .eq("school_id", schoolId)
    .maybeSingle();
  return resolveSchoolName(data?.school_name);
}

export default async function LoginPage({ params }: LoginPageProps) {
  const { slug } = await params;
  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const [environmentId, schoolName] = await Promise.all([
    getSchoolEnvironmentId(school.id),
    loadSchoolName(school.id, school.name),
  ]);

  return (
    <LoginForm
      schoolSlug={school.slug}
      schoolId={school.id}
      schoolName={schoolName}
      blackbaudEnabled={Boolean(environmentId)}
    />
  );
}
