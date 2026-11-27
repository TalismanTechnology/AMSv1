"use client";

import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { googleCalendarUrl, icsPath, type CalendarEventInput } from "@/lib/calendar/ics";
import { getNativePlatform } from "@/lib/native/platform";
import { SYSTEM_BROWSER_LINK } from "@/lib/native/links";
import { useT } from "@/components/i18n/locale-provider";

// "Add to calendar" for one school event: Apple Calendar (.ics) or Google
// Calendar (its "new event" form).
//
// Apple Calendar
// - Website: a plain link to /api/events/:id/ics, authorized by the session
//   cookie. iOS Safari shows the event with "Add to Calendar"; desktop
//   browsers download it or hand it to the calendar app.
// - iOS app: the web view can't pass a calendar file to Calendar, so the
//   file opens in Safari instead. Safari lacks the app's cookies, so opening
//   the menu fetches a signed link that's good for this user and event for a
//   few minutes (lib/calendar/ics-token.ts). The item is then a same-site
//   target="_blank" link: native-shell.tsx leaves same-site links alone, and
//   Capacitor hands the new-window request to UIApplication.shared.open,
//   i.e. Safari (/api/* is excluded from universal links, so it can't bounce
//   back into the app). The link is fetched ahead because a window may only
//   open straight from the tap.
// - Android app (no Apple Calendar, so labeled as a calendar file): the web
//   view has no download handling, so the signed link opens in a Custom Tab,
//   which downloads it for the calendar app to open.
//
// Google Calendar: a new tab on the website; in the apps SYSTEM_BROWSER_LINK
// sends it to the system browser (or the Google Calendar app).

export interface AddToCalendarProps {
  event: CalendarEventInput;
  /** The trigger; gets the menu's open state and aria wiring. */
  children: ReactNode;
  align?: "start" | "end" | "center";
}

export function AddToCalendarMenu({ event, children, align = "end" }: AddToCalendarProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const platform = getNativePlatform();
  // English outside the parent area's locale provider (admin calendar).
  const t = useT();
  const range = event.date_end && event.date_end !== event.date ? event.date_end : null;
  const webIcsHref = icsPath(event.id, { end: range });

  let googleHref: string | null = null;
  try {
    googleHref = googleCalendarUrl(event);
  } catch {
    googleHref = null;
  }

  async function fetchSignedUrl(): Promise<string | null> {
    try {
      const res = await fetch(webIcsHref, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { url?: string };
      return data.url ?? null;
    } catch (caught) {
      console.error("[add-to-calendar] signed link failed", caught);
      toast.error(t("parent.addToCalendar.appleError"));
      return null;
    }
  }

  function onOpenChange(open: boolean) {
    if (!open || platform !== "ios") return;
    // A fresh link each time, so it's never near expiry when tapped.
    setSignedUrl(null);
    setPreparing(true);
    void fetchSignedUrl()
      .then(setSignedUrl)
      .finally(() => setPreparing(false));
  }

  async function openOnAndroid() {
    const url = await fetchSignedUrl();
    if (!url) return;
    try {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url });
    } catch (caught) {
      console.error("[add-to-calendar] browser failed", caught);
      window.location.assign(url);
    }
  }

  const itemClass = "min-h-10 text-sm sm:min-h-0";

  return (
    <DropdownMenu modal={false} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-48">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {t("parent.calendar.addToCalendar")}
        </DropdownMenuLabel>
        {platform === "ios" ? (
          signedUrl ? (
            <DropdownMenuItem asChild className={itemClass}>
              <a href={signedUrl} target="_blank" rel="noopener noreferrer" {...SYSTEM_BROWSER_LINK}>
                Apple Calendar
              </a>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem disabled className={itemClass}>
              {preparing
                ? t("parent.addToCalendar.applePreparing")
                : t("parent.addToCalendar.appleUnavailable")}
            </DropdownMenuItem>
          )
        ) : platform === "android" ? (
          <DropdownMenuItem className={itemClass} onSelect={() => void openOnAndroid()}>
            {t("parent.addToCalendar.icsFile")}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem asChild className={itemClass}>
            <a href={webIcsHref}>Apple Calendar</a>
          </DropdownMenuItem>
        )}
        {googleHref && (
          <DropdownMenuItem asChild className={itemClass}>
            <a href={googleHref} target="_blank" rel="noopener noreferrer" {...SYSTEM_BROWSER_LINK}>
              Google Calendar
            </a>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
