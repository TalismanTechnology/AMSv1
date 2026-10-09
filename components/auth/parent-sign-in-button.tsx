import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AUTH_PROVIDERS, parentSignInHref, type AuthProvider } from "@/lib/auth/provider";

interface ParentSignInButtonProps {
  schoolSlug: string;
  provider: AuthProvider;
}

/**
 * The one way parents sign in: "Sign in with Blackbaud" or "Sign in with
 * Veracross", whichever the school uses. A plain anchor, not next/link: the
 * target is a route handler that redirects off-site, so prefetching it or
 * client-navigating to it would be wrong.
 */
export function ParentSignInButton({ schoolSlug, provider }: ParentSignInButtonProps) {
  return (
    <Button asChild size="lg" className="group h-12 w-full text-base">
      <a href={parentSignInHref(provider, schoolSlug)}>
        Sign in with {AUTH_PROVIDERS[provider].label}
        <ArrowRight className="ml-1 size-4 transition-transform group-hover:translate-x-0.5" />
      </a>
    </Button>
  );
}
