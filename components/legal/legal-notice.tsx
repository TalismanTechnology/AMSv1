import Link from "next/link";

/** Small print under sign-in forms linking to the Terms and Privacy Policy. */
export function LegalNotice({ className = "" }: { className?: string }) {
  return (
    <p className={`text-center text-xs text-muted-foreground ${className}`}>
      By signing in, you agree to our{" "}
      <Link href="/terms" className="underline underline-offset-4 hover:text-ink">
        Terms of Service
      </Link>{" "}
      and{" "}
      <Link href="/privacy" className="underline underline-offset-4 hover:text-ink">
        Privacy Policy
      </Link>
      .
    </p>
  );
}
