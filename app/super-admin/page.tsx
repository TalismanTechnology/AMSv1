import { createClient } from "@/lib/supabase/server";
import {
  hasVerifiedGoogleEmail,
  isGoogleSignInEnabled,
  isPasswordSignInDisabled,
} from "@/lib/auth/google-sign-in";
import { SuperAdminClient } from "./client";
import { SignInSecurity } from "./sign-in-security";

export default async function SuperAdminPage() {
  const supabase = await createClient();

  const [{ data: schools }, { data: { user } }] = await Promise.all([
    supabase
      .from("schools")
      .select("*, school_memberships(count)")
      .order("created_at", { ascending: false }),
    supabase.auth.getUser(),
  ]);

  return (
    <>
      <SuperAdminClient schools={schools || []} />
      {user && (
        <SignInSecurity
          email={user.email ?? ""}
          googleSignInEnabled={isGoogleSignInEnabled()}
          googleLinked={hasVerifiedGoogleEmail(user)}
          passwordDisabled={isPasswordSignInDisabled(user.app_metadata)}
        />
      )}
    </>
  );
}
