"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { PluginListenerHandle } from "@capacitor/core";
import { getNativePlatform } from "@/lib/native/platform";
import { deepLinkPath, opensInAppBrowser } from "@/lib/native/links";

// The parts of the iOS / Android app that make it feel like an app rather
// than a website in a frame. Renders nothing, and does nothing on the website.
//
// - Hides the native launch screen once the first page has rendered.
// - Links to other sites open in the in-app browser (SFSafariViewController /
//   Chrome Custom Tab) over the app, instead of leaving for Safari.
// - Universal links (https://askmyschool.app/s/…/parent/…) and
//   app.askmyschool://open?path=… open the matching page in the app.
// - Pull-to-refresh (UIRefreshControl in AppViewController.swift) refreshes
//   the page's data without losing what's on screen, e.g. a chat in progress.
// - Tells the parent when the connection drops and comes back. If a page
//   can't load at all, the app shows mobile/www/index.html instead.
//
// Sign-in (native-bridge.tsx) and push notifications (native-push.tsx) live
// in their own components.

declare global {
  interface Window {
    /** Called by the native pull-to-refresh control. */
    __amsRefresh?: () => void;
  }
}

const OFFLINE_TOAST_ID = "native-offline";

export function NativeShell() {
  const router = useRouter();

  useEffect(() => {
    if (!getNativePlatform()) return;

    let cancelled = false;
    const handles: PluginListenerHandle[] = [];

    // Pull-to-refresh: re-render server data, keep client state.
    window.__amsRefresh = () => router.refresh();

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.hasAttribute("download")) return;
      if (!opensInAppBrowser(anchor.href, window.location.origin)) return;

      event.preventDefault();
      void import("@capacitor/browser")
        .then(({ Browser }) => Browser.open({ url: anchor.href, presentationStyle: "popover" }))
        .catch((caught: unknown) => {
          console.error("[native] in-app browser failed", caught);
          window.location.assign(anchor.href);
        });
    };
    // Capture phase, so this runs before the anchor navigates. Sign-in links
    // are same-site, so they never reach the in-app browser.
    document.addEventListener("click", onClick, true);

    const onOffline = () =>
      toast.warning("You're offline", {
        id: OFFLINE_TOAST_ID,
        description: "AskMySchool will catch up when you're back online.",
        duration: Infinity,
      });
    const onOnline = () => {
      toast.dismiss(OFFLINE_TOAST_ID);
      router.refresh();
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    if (!navigator.onLine) onOffline();

    void (async () => {
      const [{ App }, { SplashScreen }] = await Promise.all([
        import("@capacitor/app"),
        import("@capacitor/splash-screen"),
      ]);
      if (cancelled) return;

      void SplashScreen.hide({ fadeOutDuration: 200 }).catch(() => undefined);

      // Held by the plugin until a listener attaches, so this also catches
      // the link that launched the app.
      handles.push(
        await App.addListener("appUrlOpen", ({ url }) => {
          const path = deepLinkPath(url);
          if (path) router.push(path);
        })
      );
    })().catch((caught: unknown) => console.error("[native] shell setup failed", caught));

    return () => {
      cancelled = true;
      delete window.__amsRefresh;
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      handles.forEach((handle) => void handle.remove());
    };
  }, [router]);

  return null;
}
