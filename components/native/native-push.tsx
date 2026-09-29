"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { PluginListenerHandle } from "@capacitor/core";
import { getNativePlatform } from "@/lib/native/platform";

// Push notifications in the iOS / Android app. Mounted in the parent layout,
// so the permission prompt appears once a parent is signed in and looking at
// their school, not on the sign-in screen. Does nothing on the website.

async function registerToken(token: string, platform: "ios" | "android"): Promise<void> {
  const response = await fetch("/api/push/devices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, platform }),
  });

  if (!response.ok) {
    console.error(`[native] push registration failed: ${response.status}`);
  }
}

/** Only in-app paths are followed, never an arbitrary URL from a payload. */
function inAppPath(value: unknown): string | null {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : null;
}

export function NativePush() {
  const router = useRouter();

  useEffect(() => {
    const platform = getNativePlatform();
    if (!platform) return;

    let cancelled = false;
    const handles: PluginListenerHandle[] = [];

    void (async () => {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      if (cancelled) return;

      handles.push(
        await PushNotifications.addListener("registration", ({ value }) => {
          void registerToken(value, platform);
        }),
        await PushNotifications.addListener("registrationError", (error) => {
          console.error("[native] push registration error", error);
        }),
        // Also fires for the tap that launched the app: the plugin holds the
        // event until a listener is attached.
        await PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
          const path = inAppPath(notification.data?.url);
          if (path) router.push(path);
        })
      );

      let { receive } = await PushNotifications.checkPermissions();
      if (receive === "prompt" || receive === "prompt-with-rationale") {
        ({ receive } = await PushNotifications.requestPermissions());
      }

      if (receive === "granted" && !cancelled) {
        await PushNotifications.register();
      }
    })().catch((caught: unknown) => console.error("[native] push setup failed", caught));

    return () => {
      cancelled = true;
      handles.forEach((handle) => void handle.remove());
    };
  }, [router]);

  return null;
}
