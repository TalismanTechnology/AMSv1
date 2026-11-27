// Parent-facing strings: auth (school login, welcome / add your children,
// pending approval). See lib/i18n/messages/index.ts.
//
// The English values here are rendered as-is, so they must stay identical to
// the copy the sign-in tests expect (and to the exported constants in
// lib/auth/admin-google-only.ts). The auth.error.* values are the exact
// English messages the server sends; lib/i18n/auth-errors.ts maps them back to
// their key to show the Spanish one.
export const auth = {
  // ── Shared ────────────────────────────────────────────────────────────
  "auth.signIn": "Sign in",
  "auth.signingIn": "Signing in…",
  "auth.signingYouIn": "Signing you in…",
  "auth.signOut": "Sign out",
  "auth.signingOut": "Signing out…",
  "auth.loading": "Loading...",
  "auth.back": "Back",
  "auth.continue": "Continue",
  "auth.poweredBy": "Powered by AskMySchool",
  "auth.yourSchool": "your school",

  // ── School login page ─────────────────────────────────────────────────
  "auth.parentSignIn": "Parent sign in",
  "auth.staffSignIn": "Staff sign in",
  "auth.staffSubheading": "For school administrators.",
  "auth.parentSignInUnavailable": "Parent sign-in isn't available here right now.",
  "auth.subheadingNamed": "Sign in with your {school} {provider} account.",
  "auth.subheadingUnnamed": "Sign in with your school's {provider} account.",
  "auth.portalHint":
    "Use the same login you use for {possessive} {portal}. Only parents and guardians can sign in.",
  "auth.portal.blackbaud": "Blackbaud parent portal",
  "auth.portal.veracross": "Veracross portal",
  "auth.portal.roster": "school",
  "auth.notSetUp":
    "Parent sign-in isn't set up for {school}. Please contact the school for help signing in.",
  "auth.notEnabledNamed": "{school} hasn't turned on {provider} sign-in yet. Please check back soon.",
  "auth.notEnabledUnnamed": "Your school hasn't turned on {provider} sign-in yet. Please check back soon.",
  "auth.signInWith": "Sign in with {provider}",
  "auth.redirectingTo": "Redirecting to {provider}…",
  "auth.continueWithGoogle": "Continue with Google",
  "auth.redirectingToGoogle": "Redirecting to Google…",
  "auth.or": "or",
  "auth.adminsSignInWithGoogle": "Admins sign in with Google.",
  "auth.parentPasswordLink": "A parent with a password? Sign in with email and password",
  "auth.parentPasswordNote":
    "For parent accounts that have an AskMySchool password. Admins sign in with Google.",
  "auth.adminSignInUnavailable":
    "Admin sign-in is unavailable right now. Please contact AskMySchool support.",
  "auth.staffSignInLink": "School staff sign-in",
  "auth.backToParentSignIn": "Back to parent sign-in",
  "auth.email": "Email",
  "auth.emailPlaceholder": "you@school.org",
  "auth.password": "Password",
  "auth.passwordPlaceholder": "Enter your password",
  "auth.legalPrefix": "By signing in, you agree to our",
  "auth.legalTerms": "Terms of Service",
  "auth.legalAnd": "and",
  "auth.legalPrivacy": "Privacy Policy",

  // ── Errors (exact server messages; see lib/i18n/auth-errors.ts) ──────
  "auth.error.blackbaudCancelled": "Blackbaud sign-in was cancelled.",
  "auth.error.veracrossCancelled": "Veracross sign-in was cancelled.",
  "auth.error.expired": "Your sign-in link expired. Please try again.",
  "auth.error.blackbaudFailed": "We couldn't sign you in with Blackbaud. Please try again.",
  "auth.error.veracrossFailed": "We couldn't sign you in with Veracross. Please try again.",
  "auth.error.wrongEnvironment":
    "That Blackbaud account belongs to a different school. Make sure you pick the right school.",
  "auth.error.blackbaudNotParent":
    "Only parents and guardians can sign in here, and your Blackbaud account isn't listed as one. If that's wrong, please contact your school office.",
  "auth.error.veracrossNotParent":
    "Only parents and guardians can sign in here, and your Veracross account isn't listed as one. If that's wrong, please contact your school office.",
  "auth.error.veracrossNoEmail":
    "Your Veracross account doesn't have an email address on file. Please ask your school office to add one, then try again.",
  "auth.error.veracrossMismatch":
    "This email is already linked to a different Veracross account. Please contact your school office.",
  "auth.error.staffAccount": "This is a staff account. Please use School staff sign-in instead.",
  "auth.error.schoolNotFound": "We couldn't find that school.",
  "auth.error.temporarilyUnavailable": "Sign-in is temporarily unavailable. Please try again later.",
  "auth.error.handoffFailed": "We couldn't finish signing you in. Please try again.",
  "auth.error.rosterGate":
    "Your email isn't on {school}'s parent list for AskMySchool yet. Please contact the school office.",
  "auth.error.googleNoAccount":
    "No AskMySchool account uses this Google email. Parents: choose your school and sign in with Blackbaud or Veracross, whichever your school uses. School staff: ask your school admin to add you.",
  "auth.error.googleNotThisSchool":
    "Your Google account doesn't have access to this school. Parents: sign in with your school account on this page. School staff: ask this school's admin to add you.",
  "auth.error.googleUnverified":
    "Google hasn't verified this email address, so it can't be used to sign in. Please choose another way to sign in.",
  "auth.error.googleFailed": "We couldn't sign you in with Google. Please try again.",
  "auth.error.googleDisabled": "Google sign-in isn't available right now. Please sign in with your password.",
  "auth.error.passwordDisabled": "This account signs in with Google.",
  "auth.error.adminGoogleOnly":
    "For security, admin access requires signing in with Google. Use Continue with Google.",
  "auth.error.parentPassword":
    "Parents sign in with their school account. Choose your school and use “Sign in with Blackbaud” or “Sign in with Veracross”, whichever your school uses.",
  "auth.error.noAccess": "You do not have access to this school.",
  "auth.error.notStaff": "You're not a staff member at this school.",
  "auth.error.loginFailed": "Login failed",
  "auth.error.invalidCredentials": "Invalid login credentials",
  "auth.error.emailNotConfirmed": "Email not confirmed",
  "auth.error.nameRequired": "Name is required",
  "auth.error.invalidGrade": "Invalid grade",
  "auth.error.invalidDetails": "Invalid details",
  "auth.error.notSignedIn": "Not signed in",
  "auth.error.noSchoolAccess": "You don't have access to this school",
  "auth.error.saveChildrenFailed": "Could not save your children. Please try again.",
  "auth.error.finishSetupFailed": "Could not finish setting up your account.",

  // ── Welcome (add your children) ───────────────────────────────────────
  "auth.welcome.eyebrow": "Welcome",
  "auth.welcome.eyebrowReturning": "One more thing",
  "auth.welcome.addChildren": "Add your children",
  "auth.welcome.inAt": "You're in at {school}",
  "auth.welcome.in": "You're in",
  "auth.welcome.matched":
    "We matched you to {possessive} records as {name}. If that isn't you, contact the school office before continuing.",
  "auth.welcome.intro":
    "Tell us who your children are so answers can be tailored to their grade. You can change this later in your profile.",
  "auth.welcome.gradeNote": "Enter this year's grade — it moves up automatically each school year.",
  "auth.welcome.childName": "Child's name",
  "auth.welcome.childNumber": "Child {number}",
  "auth.welcome.namePlaceholder": "First and last name",
  "auth.welcome.gradeLevel": "Grade level",
  "auth.welcome.selectGrade": "Select",
  "auth.welcome.removeChild": "Remove child {number}",
  "auth.welcome.addAnother": "Add another child",
  "auth.welcome.atLeastOne": "Add at least one child to continue.",
  "auth.welcome.skip": "Skip for now",

  // Grade labels (display only; the stored values stay "Pre-K", "K", "1"…).
  "auth.grade.preK": "Pre-K",
  "auth.grade.k": "Kindergarten",
  "auth.grade.1": "1st Grade",
  "auth.grade.2": "2nd Grade",
  "auth.grade.3": "3rd Grade",
  "auth.grade.4": "4th Grade",
  "auth.grade.5": "5th Grade",
  "auth.grade.6": "6th Grade",
  "auth.grade.7": "7th Grade",
  "auth.grade.8": "8th Grade",
  "auth.grade.9": "9th Grade",
  "auth.grade.10": "10th Grade",
  "auth.grade.11": "11th Grade",
  "auth.grade.12": "12th Grade",

  // ── Pending approval ──────────────────────────────────────────────────
  "auth.pending.eyebrow": "Almost there",
  "auth.pending.title": "Pending approval",
  "auth.pending.body":
    "Your request to join {school} is pending review. A school administrator will approve your access.",
  "auth.pending.otherSchools": "Your other schools:",
  "auth.pending.approved": "Approved — taking you in…",
  "auth.pending.checking": "Checking automatically — this page will update once you're approved.",
};
