/**
 * App-shell service worker (final-review fix I6; spec §13.4 cold-open).
 * Deliberately small and boring:
 *
 *  - cache-first for /_next/static/* and /icons/* — content-hashed /
 *    immutable assets in production builds (registration is gated to
 *    production in src/lib/sw/register.ts precisely because dev chunks are
 *    NOT immutable).
 *  - network-first for navigations, caching a copy of each successful one;
 *    offline navigation serves the cached page, else a minimal offline
 *    fallback response.
 *  - NOTHING ELSE is touched: /api/* and every cross-origin request
 *    (Supabase, providers) pass straight through — the app-layer offline
 *    cache (src/lib/data/offline-cache.ts) owns data; this worker owns only
 *    the shell.
 *
 * Bump CACHE_NAME's version suffix when the caching strategy changes;
 * activate deletes every other cache so stale shells never linger.
 */

const CACHE_NAME = "marathon-shell-v1";

const OFFLINE_HTML =
  "<!doctype html><html><head><meta charset=\"utf-8\">" +
  "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
  "<title>Offline</title></head>" +
  "<body style=\"background:#0B0C0E;color:#9aa0a7;font-family:ui-monospace,monospace;" +
  "font-size:11px;letter-spacing:.18em;display:flex;align-items:center;" +
  "justify-content:center;min-height:100vh;text-transform:uppercase\">" +
  "OFFLINE — TRY AGAIN</body></html>";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(OFFLINE_HTML, {
      status: 503,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Supabase/providers: never intercepted
  if (url.pathname.startsWith("/api/")) return; // data is the app-layer cache's job

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
  }
});
