// The admin Settings sections, each its own page under /admin/settings/<section>,
// the former sections that are now their own admin pages (Email intake,
// Contacts), and the individual settings on them (with the anchor ids the
// command palette jumps to). Also maps the old Settings URLs (?tab=, #field,
// /settings/email, /settings/contacts) onto the new pages, so bookmarks and
// older links keep working.

export const SETTINGS_SECTIONS = [
  "school",
  "app",
  "assistant",
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
    description: "Your school's name and when grades move up.",
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
    description: "Blackbaud connection, roster sync, and where calendar links live.",
    keywords: ["blackbaud", "sky", "integration", "calendar"],
  },
};

export function isSettingsSection(value: string | null | undefined): value is SettingsSection {
  return SETTINGS_SECTIONS.includes(value as SettingsSection);
}

/** Former Settings sections, now top-level admin pages (sidebar › Content). */
export const CONTENT_PAGES = ["email-intake", "contacts"] as const;
export type ContentPage = (typeof CONTENT_PAGES)[number];

export const CONTENT_PAGE_INFO: Record<ContentPage, SettingsSectionInfo & { path: string }> = {
  "email-intake": {
    label: "Email intake",
    path: "/email-intake",
    description: "Forward school emails to become documents, and review held emails.",
    keywords: ["email", "ingestion", "inbound", "forward", "intake"],
  },
  contacts: {
    label: "Contacts",
    path: "/contacts",
    description: "Who parents are pointed to when the assistant can't answer.",
    keywords: ["staff contacts", "directory", "staff", "people"],
  },
};

/** A page that holds settings: a Settings section or a Content page. */
export type SettingsLocation = SettingsSection | ContentPage;

function isContentPage(value: string): value is ContentPage {
  return CONTENT_PAGES.includes(value as ContentPage);
}

/** The label of a settings location, with "Settings ›" for Settings sections. */
export function settingsLocationContext(location: SettingsLocation): string {
  return isContentPage(location)
    ? CONTENT_PAGE_INFO[location].label
    : `Settings › ${SETTINGS_SECTION_INFO[location].label}`;
}

/** One setting (or group of settings) with a stable anchor on its page. */
export interface SettingEntry {
  /** Element id on the section page, without the leading "#". */
  anchor: string;
  section: SettingsLocation;
  label: string;
  keywords: string[];
}

export const SETTING_ENTRIES: readonly SettingEntry[] = [
  { anchor: "setting-school-name", section: "school", label: "School name", keywords: ["name", "title"] },
  { anchor: "setting-grade-rollover", section: "school", label: "Grades move up on", keywords: ["grade rollover", "school year", "graduate", "promotion"] },
  { anchor: "setting-disable-animations", section: "app", label: "Disable animations", keywords: ["appearance", "motion", "transitions"] },
  { anchor: "setting-new-document-push", section: "app", label: "Notify parents about new documents", keywords: ["push", "notifications", "alerts"] },
  { anchor: "setting-custom-prompt", section: "assistant", label: "Custom system prompt", keywords: ["instructions", "ai", "prompt"] },
  { anchor: "setting-temperature", section: "assistant", label: "Temperature", keywords: ["creativity", "ai", "focused"] },
  { anchor: "setting-welcome-message", section: "assistant", label: "Welcome message", keywords: ["greeting", "chat"] },
  { anchor: "setting-suggested-questions", section: "assistant", label: "Suggested questions", keywords: ["starter", "prompts", "chat"] },
  { anchor: "setting-staff-contacts", section: "contacts", label: "Staff contacts", keywords: ["directory", "add contact", "main office"] },
  { anchor: "setting-suggested-contacts", section: "contacts", label: "Suggested contacts", keywords: ["approve all", "review", "suggest from documents"] },
  { anchor: "setting-email-ingestion", section: "email-intake", label: "Enable email ingestion", keywords: ["inbound", "forward", "email"] },
  { anchor: "setting-inbound-addresses", section: "email-intake", label: "Intake email addresses", keywords: ["inbound address", "forward to", "division email", "copy"] },
  { anchor: "setting-auto-sort", section: "email-intake", label: "Auto-sort into categories & folders", keywords: ["auto sort", "ai", "library", "organize"] },
  { anchor: "setting-recent-emails", section: "email-intake", label: "Recent emails", keywords: ["held", "needs review", "approve", "reject", "email log"] },
  { anchor: "setting-website-sources", section: "website", label: "Website sources", keywords: ["crawl", "sync now", "pages", "url"] },
  { anchor: "setting-sign-in-provider", section: "sign-in", label: "Sign-in method", keywords: ["provider", "login", "veracross", "blackbaud", "roster sign-in"] },
  { anchor: "setting-parent-roster", section: "sign-in", label: "Parent roster", keywords: ["csv", "upload", "allowed parents", "list"] },
  { anchor: "setting-roster-gate", section: "sign-in", label: "Require roster match", keywords: ["gate", "restrict", "only roster"] },
  { anchor: "setting-blackbaud-connection", section: "blackbaud", label: "Blackbaud connection", keywords: ["connect", "reconnect", "sync now", "roster", "oauth"] },
  { anchor: "setting-blackbaud-feeds", section: "blackbaud", label: "Blackbaud calendar links", keywords: ["ical", "events", "subscription", "calendar", "labels", "feeds"] },
];

/**
 * /s/<slug>/admin/settings, a section page, or a Content page that used to be
 * a section (/admin/email-intake, /admin/contacts), optionally at an anchor.
 */
export function settingsHref(slug: string, section?: SettingsLocation, anchor?: string): string {
  const hash = anchor ? `#${anchor}` : "";
  if (section && isContentPage(section)) {
    return `/s/${slug}/admin${CONTENT_PAGE_INFO[section].path}${hash}`;
  }
  const base = `/s/${slug}/admin/settings`;
  if (!section) return base;
  return `${base}/${section}${hash}`;
}

// Old ?tab= values on the one-page Settings.
const LEGACY_TABS: Record<string, SettingsLocation> = {
  general: "school",
  assistant: "assistant",
  contacts: "contacts",
  email: "email-intake",
  website: "website",
  "sign-in": "sign-in",
  blackbaud: "blackbaud",
};

/**
 * Other names a section might be reached by (/admin/settings/<alias>),
 * including the old /settings/email and /settings/contacts pages.
 */
const SECTION_ALIASES: Record<string, SettingsLocation> = {
  ...LEGACY_TABS,
  general: "school",
  "school-year": "school",
  appearance: "app",
  notifications: "app",
  ai: "assistant",
  chat: "assistant",
  "staff-contacts": "contacts",
  "email-ingestion": "email-intake",
  intake: "email-intake",
  "email-intake": "email-intake",
  signin: "sign-in",
  login: "sign-in",
  roster: "sign-in",
};

/** The section a path segment like "general" or "ai" refers to, if any. */
export function resolveSectionAlias(value: string): SettingsLocation | null {
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
  const section: SettingsLocation | null = blackbaud
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
const LEGACY_FIELD_IDS: Record<string, { section: SettingsLocation; anchor: string }> = {
  "school-name": { section: "school", anchor: "setting-school-name" },
  // The school-wide Contact information field was removed; staff contacts
  // are who parents are pointed to now.
  "contact-info": { section: "contacts", anchor: "setting-staff-contacts" },
  "setting-contact-info": { section: "contacts", anchor: "setting-staff-contacts" },
  "grade-rollover-month": { section: "school", anchor: "setting-grade-rollover" },
  "disable-animations": { section: "app", anchor: "setting-disable-animations" },
  "new-document-push": { section: "app", anchor: "setting-new-document-push" },
  "custom-prompt": { section: "assistant", anchor: "setting-custom-prompt" },
  "welcome-msg": { section: "assistant", anchor: "setting-welcome-message" },
  "email-ingestion-enabled": { section: "email-intake", anchor: "setting-email-ingestion" },
  "auto-sort": { section: "email-intake", anchor: "setting-auto-sort" },
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
