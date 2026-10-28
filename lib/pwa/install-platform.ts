// Which "Install app" UI (if any) this browser gets. Pure, so it's unit
// tested; lib/pwa/install-prompt.ts feeds it the live browser state.
//
// - "prompt": Chrome / Edge (and Chrome on Android) handed us a
//   `beforeinstallprompt` event, so the button opens the browser's own dialog.
// - "safari-tip": desktop Safari 17+ on macOS can add any site to the Dock but
//   has no API for it, so the button explains where the menu item is.
// - "hidden": already installed, inside the iOS / Android app, iPhone / iPad
//   (Add to Home Screen lives in the share sheet, as before), or a browser
//   that can't install sites (Firefox).

export type InstallUi = "hidden" | "prompt" | "safari-tip";

export interface InstallEnvironment {
  ua: string;
  maxTouchPoints: number;
  /** Running as an installed app: display-mode standalone or navigator.standalone. */
  standalone: boolean;
  /** Inside the Capacitor iOS / Android shell. */
  native: boolean;
  /** A deferred `beforeinstallprompt` event is waiting. */
  hasPrompt: boolean;
}

/** iPhone / iPod / iPad, including iPadOS 13+ which reports itself as a Mac. */
export function isAppleMobile(ua: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && maxTouchPoints > 1;
}

/** Desktop Safari 17+ on macOS (File > Add to Dock). */
export function isMacSafariWithAddToDock(ua: string, maxTouchPoints: number): boolean {
  if (!/Macintosh/.test(ua) || maxTouchPoints > 1) return false;
  // Every Chromium and Firefox UA also says "Safari"; rule them out by name.
  if (!/Safari\//.test(ua) || /Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS/.test(ua)) {
    return false;
  }
  const version = /Version\/(\d+)/.exec(ua);
  return version !== null && Number(version[1]) >= 17;
}

export function decideInstallUi(env: InstallEnvironment): InstallUi {
  if (env.native || env.standalone) return "hidden";
  if (isAppleMobile(env.ua, env.maxTouchPoints)) return "hidden";
  if (env.hasPrompt) return "prompt";
  if (isMacSafariWithAddToDock(env.ua, env.maxTouchPoints)) return "safari-tip";
  return "hidden";
}
