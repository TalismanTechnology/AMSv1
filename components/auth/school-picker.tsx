import { ArrowRight } from "lucide-react";
import type { SignInSchool } from "@/lib/auth/sign-in-schools";

interface SchoolPickerProps {
  schools: SignInSchool[];
}

function monogram(name: string): string {
  return name
    .split(/\s+/)
    .filter((word) => /^[A-Za-z]/.test(word))
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");
}

/**
 * "Choose your school": one card per Blackbaud-connected school. Picking one
 * goes straight to that school's Blackbaud sign-in.
 */
export function SchoolPicker({ schools }: SchoolPickerProps) {
  if (schools.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-secondary/60 px-5 py-6 text-center text-sm text-ink-soft">
        No schools have turned on Blackbaud sign-in yet.
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-3">
      {schools.map((school) => (
        <li key={school.id}>
          <a
            href={`/auth/blackbaud?school=${encodeURIComponent(school.slug)}`}
            className="group flex items-center gap-4 rounded-2xl border border-border bg-card px-5 py-4 transition-colors hover:border-ring/50 hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {school.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- admin-supplied remote logo of unknown host
              <img
                src={school.logoUrl}
                alt=""
                width={44}
                height={44}
                className="size-11 shrink-0 rounded-xl object-contain"
              />
            ) : (
              <span
                aria-hidden
                className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-medium tracking-wide text-primary"
              >
                {monogram(school.name)}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-ink">{school.name}</span>
              <span className="block text-sm text-ink-soft">
                Sign in with your Blackbaud account
              </span>
            </span>
            <ArrowRight className="size-4 shrink-0 text-ink-soft transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
          </a>
        </li>
      ))}
    </ul>
  );
}
