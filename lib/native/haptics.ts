import { getNativePlatform } from "./platform";

// Haptic feedback in the iOS / Android app; a no-op on the website. Never
// throws: a missing vibration motor isn't worth an error.

export async function impactHaptic(style: "light" | "medium" = "light"): Promise<void> {
  if (!getNativePlatform()) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: style === "medium" ? ImpactStyle.Medium : ImpactStyle.Light });
  } catch {
    // ignore
  }
}

export async function successHaptic(): Promise<void> {
  if (!getNativePlatform()) return;
  try {
    const { Haptics, NotificationType } = await import("@capacitor/haptics");
    await Haptics.notification({ type: NotificationType.Success });
  } catch {
    // ignore
  }
}
