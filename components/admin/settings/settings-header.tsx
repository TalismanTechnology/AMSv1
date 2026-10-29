import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  CONTENT_PAGE_INFO,
  SETTINGS_SECTION_INFO,
  settingsHref,
  type ContentPage,
  type SettingsSection,
} from "@/lib/settings/sections";

/** "← All settings", above every section page. */
export function SettingsBackLink({ slug }: { slug: string }) {
  return (
    <Link
      href={settingsHref(slug)}
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-ink"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      All settings
    </Link>
  );
}

/**
 * A settings section page's header. `title` false: the section's own panel
 * already opens with a heading of the same name, so the page title is only
 * for screen readers.
 */
export function SettingsPageHeader({
  slug,
  section,
  title = true,
  action,
}: {
  slug: string;
  section: SettingsSection;
  title?: boolean;
  /** e.g. the Save button, for sections saved from the header. */
  action?: React.ReactNode;
}) {
  const info = SETTINGS_SECTION_INFO[section];
  return (
    <header className="space-y-3">
      <SettingsBackLink slug={slug} />
      {title ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-ink tracking-[-0.01em]">
              {info.label}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{info.description}</p>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      ) : (
        <h1 className="sr-only">{info.label}</h1>
      )}
    </header>
  );
}

/** The header of a former Settings section that's now its own page (Content). */
export function ContentPageHeader({ page }: { page: ContentPage }) {
  const info = CONTENT_PAGE_INFO[page];
  return (
    <header>
      <h1 className="text-2xl font-semibold text-ink tracking-[-0.01em]">
        {info.label}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">{info.description}</p>
    </header>
  );
}
