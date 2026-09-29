// Detecting the iOS / Android app without loading Capacitor on the website.
//
// The native shell injects `window.Capacitor` before any page script runs, so
// checking it is free; the @capacitor/* modules are only imported (lazily)
// once this says we're in the app.

export type NativePlatform = "ios" | "android";

interface InjectedCapacitor {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
}

function injected(): InjectedCapacitor | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { Capacitor?: InjectedCapacitor }).Capacitor;
}

export function getNativePlatform(): NativePlatform | null {
  const capacitor = injected();
  if (!capacitor?.isNativePlatform?.()) return null;

  const platform = capacitor.getPlatform?.();
  return platform === "ios" || platform === "android" ? platform : null;
}
