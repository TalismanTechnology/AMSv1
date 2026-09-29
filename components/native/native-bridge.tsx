"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getNativePlatform } from "@/lib/native/platform";

// App-only behaviour for the iOS / Android shells. Renders nothing, and does
// nothing on the website.
//
// - "Sign in with Blackbaud" links open the system sign-in sheet instead of
//   loading Blackbaud inside the app (lib/native/blackbaud-sign-in.ts). The
//   links themselves stay plain anchors, so the website is unchanged.
// - The marketing page isn't part of the app: signing out lands on "/", which
//   is sent on to the sign-in page.

const BLACKBAUD_START_PATH = "/auth/blackbaud";

function blackbaudSchoolFromClick(event: MouseEvent): string | null {
  if (event.defaultPrevented || event.button !== 0) return null;

  const anchor = (event.target as Element | null)?.closest?.("a[href]");
  if (!(anchor instanceof HTMLAnchorElement)) return null;

  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin || url.pathname !== BLACKBAUD_START_PATH) {
    return null;
  }

  return url.searchParams.get("school");
}

export function NativeBridge() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (pathname === "/" && getNativePlatform()) {
      router.replace("/login");
    }
  }, [pathname, router]);

  useEffect(() => {
    const platform = getNativePlatform();
    if (!platform) return;

    let signingIn = false;

    const onClick = (event: MouseEvent) => {
      const schoolSlug = blackbaudSchoolFromClick(event);
      if (!schoolSlug) return;

      event.preventDefault();
      if (signingIn) return;
      signingIn = true;

      void import("@/lib/native/blackbaud-sign-in")
        .then(({ signInWithBlackbaud }) => signInWithBlackbaud(platform, schoolSlug))
        .catch((caught: unknown) => console.error("[native] sign-in failed", caught))
        .finally(() => {
          signingIn = false;
        });
    };

    // Capture phase, so this runs before the anchor navigates.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
