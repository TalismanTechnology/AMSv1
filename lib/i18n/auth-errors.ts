// Sign-in and onboarding errors arrive as English text: from the login server
// action (actions/auth.ts, including Supabase's own messages), from ?error= on
// the school login page (set by the Blackbaud / Veracross / Google callbacks)
// and from completeOnboarding (actions/onboarding.ts). The server keeps
// sending English; this maps each known message to its dictionary key so the
// page can show it in the parent's language. Unknown messages are shown as
// they came. Pure, so it is unit tested (lib/i18n/auth-errors.test.ts).
import type { Locale } from "./locale";
import { en, type MessageKey } from "./messages";
import { translate } from "./translate";
import { schoolPossessive } from "../school-display-name";

/** Exact English message → its auth.error.* key (built from the en dictionary). */
const KEY_BY_MESSAGE = new Map<string, MessageKey>(
  (Object.entries(en) as [MessageKey, string][])
    .filter(([key, value]) => key.startsWith("auth.error.") && !value.includes("{"))
    .map(([key, value]) => [value, key])
);

/** Messages with a school / provider name in them. */
const PATTERNS: { pattern: RegExp; key: MessageKey; names: string[] }[] = [
  {
    // app/auth/blackbaud/route.ts, app/auth/veracross/route.ts
    pattern: /^(.+) hasn't turned on (Blackbaud|Veracross) sign-in yet\. Please check back soon\.$/,
    key: "auth.notEnabledNamed",
    names: ["school", "provider"],
  },
  {
    // lib/roster/gate.ts rosterGateMessage()
    pattern: /^Your email isn't on (.+)'s parent list for AskMySchool yet\. Please contact the school office\.$/,
    key: "auth.error.rosterGate",
    names: ["school"],
  },
];

/** `message` in `locale`; English (or an unknown message) comes back unchanged. */
export function localizeAuthError(message: string, locale: Locale): string {
  if (locale === "en") return message;
  const trimmed = message.trim();
  const key = KEY_BY_MESSAGE.get(trimmed);
  if (key) return translate(locale, key);
  for (const { pattern, key: patternKey, names } of PATTERNS) {
    const match = pattern.exec(trimmed);
    if (match) {
      const values = Object.fromEntries(names.map((name, i) => [name, match[i + 1]]));
      return translate(locale, patternKey, values);
    }
  }
  return message;
}

/**
 * The school as it reads in "…for {possessive} Blackbaud parent portal" /
 * "…del portal de {possessive}". English needs the possessive form
 * ("Collegiate's", "St. James'", "your school's"); Spanish uses the plain
 * name after "de" ("Collegiate", "su escuela").
 */
export function schoolPossessiveFor(locale: Locale, schoolName: string | null | undefined): string {
  if (locale === "en") return schoolPossessive(schoolName);
  return schoolName?.trim() || translate(locale, "auth.yourSchool");
}
