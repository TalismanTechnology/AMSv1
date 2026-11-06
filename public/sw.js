// AskMySchool service worker. Deliberately tiny: it exists so Chrome / Edge
// can install the site as an app and so a dropped connection shows a friendly
// offline page instead of the browser's error.
//
// Only same-origin page navigations go through it (network first, offline
// page on failure). Everything else — POSTs, API and auth routes, Next's RSC
// / data fetches, Supabase and other cross-origin requests — is left to the
// browser untouched. Pages themselves are never cached (they're signed in).
//
// Bump VERSION when offline.html changes.

const VERSION = "v1";
const CACHE = `ams-offline-${VERSION}`;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
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

self.addEventListener("fetch", (event) => {
  // Returning without respondWith() lets the browser handle it normally.
  if (!isPageNavigation(event.request)) return;

  event.respondWith(
    fetch(event.request).catch(async () => {
      const offline = await caches.match(OFFLINE_URL, { cacheName: CACHE });
      return offline || Response.error();
    })
  );
});
