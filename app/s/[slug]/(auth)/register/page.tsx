import { getSchoolBySlug } from "@/lib/school-context";
import { loadSettings } from "@/lib/settings";
import { notFound } from "next/navigation";
import { RegisterForm } from "./register-form";

interface RegisterPageProps {
  params: Promise<{ slug: string }>;
}

export default async function RegisterPage({ params }: RegisterPageProps) {
  const { slug } = await params;
  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const settings = await loadSettings(school.id);

  return (
    <RegisterForm
      schoolSlug={school.slug}
      schoolId={school.id}
      schoolName={school.name}
      requireJoinCode={settings.require_join_code}
    />
  );
}
