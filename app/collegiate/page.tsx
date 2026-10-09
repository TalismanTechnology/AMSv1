import type { Metadata } from "next";
import { CollegiateOnboarding } from "@/components/landing/collegiate-onboarding";
import { getSignInSchools } from "@/lib/auth/sign-in-schools";

// askmyschool.app/collegiate — the link sent to Collegiate parents while they
// are onboarded. Re-rendered hourly so it picks up the school's slug.

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "AskMySchool — Collegiate School Parents",
  description:
    "Sign in with your Collegiate Blackbaud parent login and get instant answers from Collegiate's official documents.",
};

/** Collegiate's slug, or null (the page then links to the school picker). */
async function collegiateSlug(): Promise<string | null> {
  try {
    const school = (await getSignInSchools()).find((s) => /collegiate/i.test(s.name));
    return school?.slug ?? null;
  } catch {
    return null;
  }
}

export default async function CollegiatePage() {
  return <CollegiateOnboarding schoolSlug={await collegiateSlug()} />;
}
