// Where schools ask to bring AskMySchool to their families. There is no
// self-serve sign-up: schools are set up by hand, and parents sign in through
// their school's Blackbaud parent login once it's connected.
import { SUPPORT_EMAIL } from "@/lib/contact";

export const SCHOOL_CONTACT_EMAIL = SUPPORT_EMAIL;

export const SCHOOL_CONTACT_HREF = `mailto:${SCHOOL_CONTACT_EMAIL}?subject=${encodeURIComponent(
  "Bringing AskMySchool to our school"
)}`;
