import type { CapacitorConfig } from "@capacitor/cli";

// Native iOS and Android shells for AskMySchool.
//
// The app is server-rendered (auth, chat, server actions), so it can't be
// exported as static files. Instead the native shell loads the live site, and
// every Vercel deploy reaches the apps without a store release. `webDir` only
// holds the offline page (mobile/www/index.html), shown via `errorPath` when a
// page can't load.
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
    // No connection (or the site is down): show the bundled offline page,
    // which retries by itself, instead of a blank screen. On iOS,
    // AppViewController.swift keeps cancelled navigations from landing here.
    errorPath: "index.html",
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
    SplashScreen: {
      // Held until the first page renders (components/native/native-shell.tsx
      // hides it), with a timeout in case it never does.
      launchShowDuration: 4000,
      launchAutoHide: true,
      launchFadeOutDuration: 200,
      backgroundColor: "#faf8f5",
      showSpinner: false,
      iosSpinnerStyle: "small",
      splashFullScreen: false,
      splashImmersive: false,
    },
    PushNotifications: {
      // Show announcements even while the app is open.
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
