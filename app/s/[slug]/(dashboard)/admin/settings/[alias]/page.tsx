import { redirect } from "next/navigation";
import { resolveSectionAlias, settingsHref } from "@/lib/settings/sections";

// Other names for a section (/settings/general, /settings/ai, …) and unknown
// ones: on to the section, or the Settings landing page.
export default async function SettingsAliasRedirect({
  params,
}: {
  params: Promise<{ slug: string; alias: string }>;
}) {
  const { slug, alias } = await params;
  const section = resolveSectionAlias(decodeURIComponent(alias));
  redirect(settingsHref(slug, section ?? undefined));
}
