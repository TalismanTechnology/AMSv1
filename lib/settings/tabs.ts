// Tabs on the admin Settings page. Shared by the page's header (pills on wide
// screens, a dropdown on phones) and the ?tab= URL handling.

export const SETTINGS_TABS = [
  "general",
  "assistant",
  "contacts",
  "email",
  "website",
  "sign-in",
  "blackbaud",
] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

export const SETTINGS_TAB_LABELS: Record<SettingsTab, string> = {
  general: "General",
  assistant: "Assistant",
  contacts: "Contacts",
  email: "Email",
  website: "Website",
  "sign-in": "Sign-in",
  blackbaud: "Blackbaud",
};

export function isSettingsTab(value: string | null | undefined): value is SettingsTab {
  return SETTINGS_TABS.includes(value as SettingsTab);
}

/** The page URL with ?tab= set for `tab`; General is the default, so no param. */
export function settingsTabUrl(href: string, tab: SettingsTab): string {
  const url = new URL(href);
  if (tab === "general") url.searchParams.delete("tab");
  else url.searchParams.set("tab", tab);
  return url.toString();
}
