"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { LogoSpinner } from "@/components/logo-spinner";
import { Building2 } from "lucide-react";

interface SsoSignInButtonProps {
  /** Email domain registered against the Supabase SSO provider. */
  domain: string | null;
  /** Provider UUID, used when the school's IdP has no domain of its own. */
  providerId: string | null;
  label: string | null;
  schoolSlug?: string;
}

/**
 * Sends the user to their school's own identity provider — the same login they
 * use for the school website.
 *
 * Unlike signInWithOAuth, signInWithSSO does not navigate on its own; it hands
 * back the IdP URL and we do the redirect.
 */
export function SsoSignInButton({
  domain,
  providerId,
  label,
  schoolSlug,
}: SsoSignInButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!domain && !providerId) return null;

  async function handleClick() {
    setLoading(true);
    setError(null);

    const supabase = createClient();
    // Drop any half-finished session so a failed attempt can't leave the user
    // signed in as someone else.
    await supabase.auth.signOut();

    const params = new URLSearchParams();
    if (schoolSlug) params.set("school_slug", schoolSlug);
    const query = params.toString();
    const redirectTo = `${window.location.origin}/auth/callback${
      query ? `?${query}` : ""
    }`;

    const { data, error: ssoError } = await supabase.auth.signInWithSSO(
      domain
        ? { domain, options: { redirectTo } }
        : { providerId: providerId as string, options: { redirectTo } }
    );

    if (ssoError) {
      setError(ssoError.message);
      setLoading(false);
      return;
    }

    if (!data?.url) {
      setError("Your school's sign-in provider did not return a redirect.");
      setLoading(false);
      return;
    }

    window.location.assign(data.url);
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={handleClick}
        disabled={loading}
      >
        {loading ? (
          <LogoSpinner className="mr-2" />
        ) : (
          <Building2 className="mr-2 h-4 w-4" />
        )}
        {label?.trim() || "Continue with your school account"}
      </Button>
      {error && <p className="text-center text-sm text-destructive">{error}</p>}
    </div>
  );
}
