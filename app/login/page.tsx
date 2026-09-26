import Link from "next/link";
import { Logo } from "@/components/logo";
import { AuthShell } from "@/components/auth/auth-shell";
import { SchoolPicker } from "@/components/auth/school-picker";
import { getSignInSchools } from "@/lib/auth/sign-in-schools";

interface LoginPageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const [{ error }, schools] = await Promise.all([searchParams, getSignInSchools()]);

  return (
    <AuthShell wide>
      <div className="metallic-card rounded-2xl p-8 sm:p-10">
        <div className="mb-7">
          <span className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary elev-1">
            <Logo size={24} className="text-primary" />
          </span>
          <p className="eyebrow">Parent sign in</p>
          <h1 className="mt-2 font-serif-display text-3xl font-medium tracking-[-0.02em] text-ink">
            Choose your school
          </h1>
          <p className="mt-2 text-sm text-ink-soft">
            Select your school to sign in with Blackbaud.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-5 rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        <SchoolPicker schools={schools} />

        <p className="mt-7 text-center text-sm text-ink-soft">
          School staff?{" "}
          <Link href="/login/staff" className="font-medium text-ink underline-offset-4 hover:underline">
            Staff sign-in
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
