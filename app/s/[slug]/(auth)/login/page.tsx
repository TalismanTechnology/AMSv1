import { getSchoolBySlug } from "@/lib/school-context";
import { getSchoolEnvironmentId } from "@/lib/auth/sign-in-schools";
import { notFound } from "next/navigation";
import { LoginForm } from "./login-form";

interface LoginPageProps {
  params: Promise<{ slug: string }>;
}

export default async function LoginPage({ params }: LoginPageProps) {
  const { slug } = await params;
  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const blackbaudEnabled = Boolean(await getSchoolEnvironmentId(school.id));

  return (
    <LoginForm
      schoolSlug={school.slug}
      schoolId={school.id}
      schoolName={school.name}
      blackbaudEnabled={blackbaudEnabled}
    />
  );
}
