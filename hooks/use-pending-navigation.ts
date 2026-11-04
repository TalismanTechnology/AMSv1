import { useEffect, useState, type MouseEvent } from "react";

// Pending state for a plain <a> that leaves the page (a route handler that
// redirects off-site, e.g. "Sign in with Blackbaud"). Starts on a plain
// left click and stays on until the browser unloads the page. Skipped when
// something else already handled the click (the native app's bridge opens a
// sign-in sheet instead) or it opens elsewhere (modifier keys). Cleared on
// `pageshow` so Back from the provider (bfcache) doesn't restore a spinner.
export function usePendingNavigation<T = true>() {
  const [pending, setPending] = useState<T | null>(null);

  useEffect(() => {
    const reset = (event: PageTransitionEvent) => {
      if (event.persisted) setPending(null);
    };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  function start(event: MouseEvent<HTMLAnchorElement>, value: T = true as T) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    setPending(() => value);
  }

  return { pending, start };
}
