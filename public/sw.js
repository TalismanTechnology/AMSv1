// AskMySchool service worker. Deliberately tiny: it exists so Chrome / Edge
// can install the site as an app and so a dropped connection shows a friendly
// offline page instead of the browser's error.
//
// Only same-origin page navigations go through it (network first, offline
// page on failure), plus the precached offline fonts used by offline.html.
// Everything else — POSTs, API and auth routes, Next's RSC / data fetches,
// Supabase and other cross-origin requests — is left to the browser untouched.
// Pages themselves are never cached (they're signed in).
//
// Bump VERSION when offline.html changes.

const VERSION = "v2";
const CACHE = `ams-offline-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/fonts/YesevaOne-Regular.ttf",
  "/fonts/JosefinSans-Regular.ttf",
  "/fonts/JosefinSans-SemiBold.ttf",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        Promise.all(
          PRECACHE_URLS.map((url) =>
            cache.add(new Request(url, { cache: "reload" }))
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("ams-") && key !== CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isPageNavigation(request) {
  if (request.method !== "GET" || request.mode !== "navigate") return false;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    url.pathname.startsWith("/_next/")
  ) {
    return false;
  }
  if (
    url.searchParams.has("_rsc") ||
    request.headers.get("RSC") === "1" ||
    request.headers.has("Next-Router-State-Tree")
  ) {
    return false;
  }
  return true;
}

function isOfflineFont(request) {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  return url.origin === self.location.origin && PRECACHE_URLS.includes(url.pathname) && url.pathname !== OFFLINE_URL;
}

self.addEventListener("fetch", (event) => {
  if (isOfflineFont(event.request)) {
    event.respondWith(
      caches.match(event.request, { cacheName: CACHE }).then((cached) => cached || fetch(event.request))
    );
    return;
  }

  // Returning without respondWith() lets the browser handle it normally.
  if (!isPageNavigation(event.request)) return;

  event.respondWith(
    fetch(event.request).catch(async () => {
      const offline = await caches.match(OFFLINE_URL, { cacheName: CACHE });
      return offline || Response.error();
    })
  );
});
