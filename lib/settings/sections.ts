// The admin Settings sections, each its own page under /admin/settings/<section>,
// and the individual settings on them (with the anchor ids the command palette
// jumps to). Also maps the old one-page Settings URLs (?tab=, #field) onto the
// new pages, so bookmarks and older links keep working.

export const SETTINGS_SECTIONS = [
  "school",
  "app",
  "assistant",
  "contacts",
  "email",
  "website",
  "sign-in",
  "blackbaud",
] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export interface SettingsSectionInfo {
  label: string;
  description: string;
  keywords: string[];
}

export const SETTINGS_SECTION_INFO: Record<SettingsSection, SettingsSectionInfo> = {
  school: {
    label: "School",
    description: "Your school's name, contact details, and when grades move up.",
    keywords: ["general", "school year", "profile"],
  },
  app: {
    label: "App & notifications",
    description: "Animations and the push notifications parents get in the app.",
    keywords: ["general", "appearance", "display", "push"],
  },
  assistant: {
    label: "Assistant",
    description: "How the AI answers parents, the welcome message, and suggested questions.",
    keywords: ["ai", "chat", "prompt"],
  },
  contacts: {
    label: "Staff contacts",
    description: "Who parents are pointed to when the assistant can't answer.",
    keywords: ["contacts", "directory", "staff", "people"],
  },
  email: {
    label: "Email intake",
    description: "Forward school emails to become documents, and review held emails.",
    keywords: ["email", "ingestion", "inbound", "forward", "intake"],
  },
  website: {
    label: "Website",
    description: "Pages from your school's website the assistant can read.",
    keywords: ["website", "crawl", "sync", "web pages"],
  },
  "sign-in": {
    label: "Parent sign-in",
    description: "How parents sign in, the parent roster, and the roster gate.",
    keywords: ["sign-in", "login", "auth", "roster"],
  },
  blackbaud: {
    label: "Blackbaud",
    description: "Blackbaud connection, roster sync, and calendar feeds.",
    keywords: ["blackbaud", "sky", "integration", "calendar"],
  },
};

export function isSettingsSection(value: string | null | undefined): value is SettingsSection {
  return SETTINGS_SECTIONS.includes(value as SettingsSection);
}

/** One setting (or group of settings) with a stable anchor on its page. */
export interface SettingEntry {
  /** Element id on the section page, without the leading "#". */
  anchor: string;
  section: SettingsSection;
  label: string;
  keywords: string[];
}

export const SETTING_ENTRIES: readonly SettingEntry[] = [
  { anchor: "setting-school-name", section: "school", label: "School name", keywords: ["name", "title"] },
  { anchor: "setting-contact-info", section: "school", label: "Contact information", keywords: ["phone", "address", "office"] },
  { anchor: "setting-grade-rollover", section: "school", label: "Grades move up on", keywords: ["grade rollover", "school year", "graduate", "promotion"] },
  { anchor: "setting-disable-animations", section: "app", label: "Disable animations", keywords: ["appearance", "motion", "transitions"] },
  { anchor: "setting-new-document-push", section: "app", label: "Notify parents about new documents", keywords: ["push", "notifications", "alerts"] },
  { anchor: "setting-custom-prompt", section: "assistant", label: "Custom system prompt", keywords: ["instructions", "ai", "prompt"] },
  { anchor: "setting-temperature", section: "assistant", label: "Temperature", keywords: ["creativity", "ai", "focused"] },
  { anchor: "setting-welcome-message", section: "assistant", label: "Welcome message", keywords: ["greeting", "chat"] },
  { anchor: "setting-suggested-questions", section: "assistant", label: "Suggested questions", keywords: ["starter", "prompts", "chat"] },
  { anchor: "setting-staff-contacts", section: "contacts", label: "Staff contacts", keywords: ["directory", "add contact", "main office"] },
  { anchor: "setting-suggested-contacts", section: "contacts", label: "Suggested contacts", keywords: ["approve all", "review", "suggest from documents"] },
  { anchor: "setting-email-ingestion", section: "email", label: "Enable email ingestion", keywords: ["inbound", "forward", "email"] },
  { anchor: "setting-inbound-addresses", section: "email", label: "Intake email addresses", keywords: ["inbound address", "forward to", "division email", "copy"] },
  { anchor: "setting-auto-sort", section: "email", label: "Auto-sort into categories & folders", keywords: ["auto sort", "ai", "library", "organize"] },
  { anchor: "setting-recent-emails", section: "email", label: "Recent emails", keywords: ["held", "needs review", "approve", "reject", "email log"] },
  { anchor: "setting-website-sources", section: "website", label: "Website sources", keywords: ["crawl", "sync now", "pages", "url"] },
  { anchor: "setting-sign-in-provider", section: "sign-in", label: "Sign-in method", keywords: ["provider", "login", "veracross", "blackbaud", "roster sign-in"] },
  { anchor: "setting-parent-roster", section: "sign-in", label: "Parent roster", keywords: ["csv", "upload", "allowed parents", "list"] },
  { anchor: "setting-roster-gate", section: "sign-in", label: "Require roster match", keywords: ["gate", "restrict", "only roster"] },
  { anchor: "setting-blackbaud-connection", section: "blackbaud", label: "Blackbaud connection", keywords: ["connect", "reconnect", "sync now", "roster", "oauth"] },
  { anchor: "setting-blackbaud-feeds", section: "blackbaud", label: "Blackbaud calendar feeds", keywords: ["ical", "events", "subscription", "calendar"] },
];

/** /s/<slug>/admin/settings, or a section page, optionally at an anchor. */
export function settingsHref(slug: string, section?: SettingsSection, anchor?: string): string {
  const base = `/s/${slug}/admin/settings`;
  if (!section) return base;
  return `${base}/${section}${anchor ? `#${anchor}` : ""}`;
}

// Old ?tab= values on the one-page Settings.
const LEGACY_TABS: Record<string, SettingsSection> = {
  general: "school",
  assistant: "assistant",
  contacts: "contacts",
  email: "email",
  website: "website",
  "sign-in": "sign-in",
  blackbaud: "blackbaud",
};

/** Other names a section might be reached by (/admin/settings/<alias>). */
const SECTION_ALIASES: Record<string, SettingsSection> = {
  ...LEGACY_TABS,
  general: "school",
  "school-year": "school",
  appearance: "app",
  notifications: "app",
  ai: "assistant",
  chat: "assistant",
  "staff-contacts": "contacts",
  "email-ingestion": "email",
  intake: "email",
  "email-intake": "email",
  signin: "sign-in",
  login: "sign-in",
  roster: "sign-in",
};

/** The section a path segment like "general" or "ai" refers to, if any. */
export function resolveSectionAlias(value: string): SettingsSection | null {
  const key = value.toLowerCase();
  return isSettingsSection(key) ? key : (SECTION_ALIASES[key] ?? null);
}

/**
 * Where an old /admin/settings?tab=…/?blackbaud=… URL now lives, or null when
 * there's nothing to redirect (the landing page shows). Other query params are
 * kept, so Blackbaud's ?blackbaud=connected still reaches its notice.
 */
export function legacySettingsRedirect(
  slug: string,
  searchParams: Record<string, string | string[] | undefined>
): string | null {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const tab = first(searchParams.tab);
  const blackbaud = first(searchParams.blackbaud);

  // Returning from Blackbaud's consent screen always shows the Blackbaud page.
  const section: SettingsSection | null = blackbaud
    ? "blackbaud"
    : tab
      ? (LEGACY_TABS[tab] ?? null)
      : null;
  if (!section) return null;

  const rest = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === "tab" || value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) rest.append(key, v);
  }
  const query = rest.toString();
  return `${settingsHref(slug, section)}${query ? `?${query}` : ""}`;
}

// Element ids from the old one-page Settings that someone may have linked to.
const LEGACY_FIELD_IDS: Record<string, { section: SettingsSection; anchor: string }> = {
  "school-name": { section: "school", anchor: "setting-school-name" },
  "contact-info": { section: "school", anchor: "setting-contact-info" },
  "grade-rollover-month": { section: "school", anchor: "setting-grade-rollover" },
  "disable-animations": { section: "app", anchor: "setting-disable-animations" },
  "new-document-push": { section: "app", anchor: "setting-new-document-push" },
  "custom-prompt": { section: "assistant", anchor: "setting-custom-prompt" },
  "welcome-msg": { section: "assistant", anchor: "setting-welcome-message" },
  "email-ingestion-enabled": { section: "email", anchor: "setting-email-ingestion" },
  "auto-sort": { section: "email", anchor: "setting-auto-sort" },
  "require-roster-match": { section: "sign-in", anchor: "setting-roster-gate" },
};

/**
 * Where an old /admin/settings#… link now lives: a tab name ("#email"), an
 * old field id ("#auto-sort") or a new setting anchor. Null if unknown.
 */
export function legacySettingsHashTarget(
  slug: string,
  hash: string
): string | null {
  const key = decodeURIComponent(hash.replace(/^#/, ""));
  if (!key) return null;
  const entry = SETTING_ENTRIES.find((e) => e.anchor === key);
  if (entry) return settingsHref(slug, entry.section, entry.anchor);
  const field = LEGACY_FIELD_IDS[key];
  if (field) return settingsHref(slug, field.section, field.anchor);
  const section = resolveSectionAlias(key);
  return section ? settingsHref(slug, section) : null;
}
