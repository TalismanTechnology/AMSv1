import type { CapacitorConfig } from "@capacitor/cli";

// Native iOS and Android shells for AskMySchool.
//
// The app is server-rendered (auth, chat, server actions), so it can't be
// exported as static files. Instead the native shell loads the live site, and
// every Vercel deploy reaches the apps without a store release. `webDir` only
// holds the page shown if the site can't be reached.
//
// The Capacitor CLI needs Node 22+ (e.g. `fnm exec --using=22 npx cap sync`).
// For trying unreleased web changes in the simulator, sync with e.g.
// CAP_SERVER_URL=http://localhost:3000/login. Never ship a build synced that way.
const serverUrl = process.env.CAP_SERVER_URL ?? "https://askmyschool.app/login";

const config: CapacitorConfig = {
  appId: "app.askmyschool",
  appName: "AskMySchool",
  webDir: "mobile/www",
  server: {
    // Parents open the app to sign in, not to read the marketing page.
    url: serverUrl,
    cleartext: serverUrl.startsWith("http://"),
    // Anything not listed here opens in the system browser instead of the app.
    // Blackbaud is deliberately absent: pages in this web view can reach the
    // native plugins, so parent sign-in runs in the system sign-in sheet
    // (lib/native/blackbaud-sign-in.ts) and anything else Blackbaud opens in
    // the browser.
    allowNavigation: serverUrl.startsWith("http://localhost")
      ? ["askmyschool.app", "localhost"]
      : ["askmyschool.app"],
  },
  ios: {
    // Safe-area layout is handled natively in AppViewController.swift.
    contentInset: "never",
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    PushNotifications: {
      // Show announcements even while the app is open.
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
