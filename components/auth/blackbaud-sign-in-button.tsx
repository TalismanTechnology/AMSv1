import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BlackbaudSignInButtonProps {
  schoolSlug: string;
}

/**
 * The one way parents sign in. A plain anchor, not next/link: the target is a
 * route handler that redirects off-site to Blackbaud, so prefetching it or
 * client-navigating to it would be wrong.
 */
export function BlackbaudSignInButton({ schoolSlug }: BlackbaudSignInButtonProps) {
  return (
    <Button asChild size="lg" className="group h-12 w-full text-base">
      <a href={`/auth/blackbaud?school=${encodeURIComponent(schoolSlug)}`}>
        Sign in with Blackbaud
        <ArrowRight className="ml-1 size-4 transition-transform group-hover:translate-x-0.5" />
      </a>
    </Button>
  );
}
