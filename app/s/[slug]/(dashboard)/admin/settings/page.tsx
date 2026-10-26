import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { requireSchoolContext } from "@/lib/school-context";
import { PageTransition } from "@/components/motion";
import {
  CONTENT_PAGE_INFO,
  SETTINGS_SECTIONS,
  SETTINGS_SECTION_INFO,
  legacySettingsRedirect,
  settingsHref,
} from "@/lib/settings/sections";
import { SETTINGS_SECTION_ICONS } from "@/components/admin/settings/section-icons";
import { LegacySettingsHashRedirect } from "./legacy-hash-redirect";

// The Settings landing page: one card per section. Settings used to be a
// single page with ?tab=; those links are sent on to the matching section
// (Email intake and Contacts now live under Content in the sidebar).
export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  await requireSchoolContext(slug);

  const legacy = legacySettingsRedirect(slug, await searchParams);
  if (legacy) redirect(legacy);

  return (
    <PageTransition>
      <LegacySettingsHashRedirect slug={slug} />
      <div className="mx-auto max-w-2xl space-y-8 pb-8">
        <div>
          <h1 className="text-2xl font-semibold text-ink tracking-[-0.01em]">
            Settings
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure your school&apos;s AskMySchool instance.
          </p>
        </div>

        <ul className="grid gap-3 sm:grid-cols-2">
          {SETTINGS_SECTIONS.map((section) => {
            const info = SETTINGS_SECTION_INFO[section];
            const Icon = SETTINGS_SECTION_ICONS[section];
            return (
              <li key={section}>
                <Link
                  href={settingsHref(slug, section)}
                  className="group flex h-full items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <Icon className="mt-0.5 h-[18px] w-[18px] shrink-0 text-muted-foreground group-hover:text-ink" />
                  <span className="min-w-0 flex-1 space-y-0.5">
                    <span className="block text-sm font-medium text-ink">
                      {info.label}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {info.description}
                    </span>
                  </span>
                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>

        <p className="text-xs text-muted-foreground">
          Looking for{" "}
          <Link
            href={settingsHref(slug, "email-intake")}
            className="text-ink underline-offset-2 hover:underline"
          >
            {CONTENT_PAGE_INFO["email-intake"].label}
          </Link>{" "}
          or{" "}
          <Link
            href={settingsHref(slug, "contacts")}
            className="text-ink underline-offset-2 hover:underline"
          >
            {CONTENT_PAGE_INFO.contacts.label}
          </Link>
          ? They&apos;re now under Content in the sidebar.
        </p>
      </div>
    </PageTransition>
  );
}
