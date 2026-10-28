"use client";

import { useEffect } from "react";
import { getNativePlatform } from "@/lib/native/platform";
import { startInstallPromptCapture } from "@/lib/pwa/install-prompt";

// Registers public/sw.js (offline fallback page, and what makes Chrome / Edge
// offer "Install app") and starts catching `beforeinstallprompt`. Production
// website only: a dev service worker just gets in the way of hot reload, and
// the iOS / Android app doesn't need one. Renders nothing.
export function PwaSetup() {
  useEffect(() => {
    startInstallPromptCapture();

    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator) || getNativePlatform()) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // Not fatal: the site works the same without it, just no offline page.
      });
    };
    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
