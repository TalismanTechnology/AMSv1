"use server";

import { getSignInSchools, type SignInSchool } from "@/lib/auth/sign-in-schools";

// Public by design: the same list the /login "Choose your school" page shows.
export async function listSignInSchools(): Promise<
  { schools: SignInSchool[] } | { error: string }
> {
  try {
    return { schools: await getSignInSchools() };
  } catch (caught: unknown) {
    console.error(caught);
    return { error: "Couldn't load schools. Please try again." };
  }
}
