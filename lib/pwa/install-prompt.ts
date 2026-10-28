import { useSyncExternalStore } from "react";
import { getNativePlatform } from "@/lib/native/platform";
import { decideInstallUi, type InstallUi } from "./install-platform";

// Chrome / Edge fire `beforeinstallprompt` once the site is installable, and
// it can fire before React hydrates. This module starts listening as soon as
// it loads (it's imported by <PwaSetup /> in the root layout), stashes the
// event, and hands it to whichever "Install app" button is on screen.

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
let started = false;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

/** Idempotent; runs on module load in the browser. */
export function startInstallPromptCapture() {
  if (started || typeof window === "undefined") return;
  started = true;

  window.addEventListener("beforeinstallprompt", (event) => {
    // Keep Chrome's own mini-infobar out of the way; our button asks instead.
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    installed = true;
    notify();
  });
}

startInstallPromptCapture();

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const standalone = window.matchMedia("(display-mode: standalone)");
  standalone.addEventListener("change", listener);
  return () => {
    listeners.delete(listener);
    standalone.removeEventListener("change", listener);
  };
}

function getSnapshot(): InstallUi {
  return decideInstallUi({
    ua: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    standalone: installed || isStandalone(),
    native: getNativePlatform() !== null,
    hasPrompt: deferredPrompt !== null,
  });
}

function getServerSnapshot(): InstallUi {
  return "hidden";
}

/** Shows Chrome / Edge's install dialog. The event is single-use either way. */
export async function promptInstall(): Promise<void> {
  const event = deferredPrompt;
  if (!event) return;
  deferredPrompt = null;
  notify();
  await event.prompt();
  await event.userChoice;
}

export function useInstallUi(): InstallUi {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
