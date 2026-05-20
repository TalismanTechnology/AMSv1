import Link from "next/link";
import { notFound } from "next/navigation";
import { getSchoolBySlug } from "@/lib/school-context";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

export default async function SchoolLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const school = await getSchoolBySlug(slug);

  if (!school) {
    notFound();
  }

  return (
    <div className="neo relative z-10 flex min-h-screen flex-col items-center justify-center px-4">
      <div className="relative z-10 text-center space-y-8">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full metallic-surface border border-glass-border neon-border">
          <Logo
            size={32}
            className="text-primary"
          />
        </div>

        <div className="space-y-2">
          <h1 className="text-4xl font-bold metallic-heading neon-text-soft">
            {school.name}
          </h1>
          <p className="text-muted-foreground">
            Powered by AskMySchool
          </p>
        </div>

        <div className="flex gap-4 justify-center">
          <Button asChild size="lg">
            <Link href={`/s/${slug}/login`}>Sign in</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href={`/s/${slug}/register`}>Create account</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
