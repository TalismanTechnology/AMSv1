// Where schools ask to bring AskMySchool to their families. There is no
// self-serve sign-up: schools are set up by hand, and parents sign in through
// their school's Blackbaud parent login once it's connected.
//
// TODO: switch to an @askmyschool.app address (e.g. hello@askmyschool.app)
// once that mailbox exists.
export const SCHOOL_CONTACT_EMAIL = "lucashaines2010@gmail.com";

export const SCHOOL_CONTACT_HREF = `mailto:${SCHOOL_CONTACT_EMAIL}?subject=${encodeURIComponent(
  "Bringing AskMySchool to our school"
)}`;
