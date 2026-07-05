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
    <div className="relative z-10 flex min-h-screen flex-col items-center justify-center overflow-hidden px-6">
      <div
        aria-hidden
        className="depth-glow left-1/2 top-1/4 h-[420px] w-[420px] -translate-x-1/2"
        style={{ background: "oklch(0.635 0.148 47 / 12%)" }}
      />
      <div className="relative z-10 w-full max-w-lg">
        <div className="metallic-card rounded-3xl px-8 py-12 text-center sm:px-12">
          <span className="mx-auto mb-8 flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary elev-1">
            <Logo size={32} className="text-primary" />
          </span>

          <p className="eyebrow">Welcome to</p>
          <h1 className="mt-3 font-serif-display text-4xl font-medium tracking-[-0.02em] text-ink sm:text-5xl">
            {school.name}
          </h1>
          <p className="mt-4 text-ink-soft">
            Ask questions in plain English and get instant, cited answers from{" "}
            {school.name}&apos;s official documents.
          </p>

          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-12 px-6 text-base">
              <Link href={`/s/${slug}/login`}>Sign in</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-12 px-6 text-base"
            >
              <Link href={`/s/${slug}/register`}>Create account</Link>
            </Button>
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Powered by AskMySchool
        </p>
      </div>
    </div>
  );
}
