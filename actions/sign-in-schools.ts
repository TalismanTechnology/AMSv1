"use server";

import { getSignInSchools } from "@/lib/auth/sign-in-schools";
import { partitionJoinableSchools, type JoinableSchools } from "@/lib/auth/joinable-schools";
import { createClient } from "@/lib/supabase/server";

// The "Add a school" list: the same schools the /login "Choose your school"
// page shows, minus the ones the signed-in user already belongs to (pending
// ones are returned separately).
export async function listJoinableSchools(): Promise<JoinableSchools | { error: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const [schools, memberships] = await Promise.all([
      getSignInSchools(),
      user
        ? supabase
            .from("school_memberships")
            .select("school_id, approved")
            .eq("user_id", user.id)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (memberships.error) throw new Error(memberships.error.message);

    return partitionJoinableSchools(schools, memberships.data ?? []);
  } catch (caught: unknown) {
    console.error(caught);
    return { error: "Couldn't load schools. Please try again." };
  }
}
