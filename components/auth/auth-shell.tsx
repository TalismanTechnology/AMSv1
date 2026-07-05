"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface AuthShellProps {
  eyebrow?: string;
  headline?: React.ReactNode;
  subhead?: string;
  points?: string[];
  /** Widen the form column for multi-field forms (e.g. registration). */
  wide?: boolean;
  children: React.ReactNode;
}

/**
 * Minimalist centered auth layout: a single clean column on the paper
 * background with a back link. The form card supplies its own logo and
 * heading. (Brand-copy props are accepted for compatibility but not shown
 * in the flat minimal treatment.)
 */
export function AuthShell({ wide = false, children }: AuthShellProps) {
  return (
    <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-5 py-16">
      <Link
        href="/"
        className="group absolute left-5 top-6 flex items-center gap-2 text-sm text-ink-soft transition-colors hover:text-ink sm:left-8"
      >
        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
        Back
      </Link>
      <div className={wide ? "w-full max-w-xl" : "w-full max-w-md"}>
        {children}
      </div>
    </div>
  );
}
