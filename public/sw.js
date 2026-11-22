/*
  ExecAtlas service worker: minimal offline support.
  - cache-first for hashed static assets
  - network-first for page navigations with a cached fallback
  The default-locale home is the offline fallback; "/" only meta-refreshes to
  /en, so falling back to "/" offline would loop.
*/
const CACHE = "execatlas-v2";
const DATA_CACHE = "execatlas-data";
const CORE = ["/en", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all([
          ...keys.filter((k) => k !== CACHE && k !== DATA_CACHE).map((k) => caches.delete(k)),
          // one dataset copy per activate: drop every hashed snapshot
          caches.delete(DATA_CACHE),
        ])
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached ?? caches.match("/en")))
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
            return response;
          })
      )
    );
    return;
  }

  // the dataset asset URL is content-addressed and changes nightly; a
  // dedicated cache cleared on activate keeps storage bounded to one copy
  if (url.pathname.startsWith("/data/")) {
    event.respondWith(
      caches.open(DATA_CACHE).then((cache) =>
        cache.match(request).then(
          (cached) =>
            cached ??
            fetch(request).then((response) => {
              cache.put(request, response.clone());
              return response;
            })
        )
      )
    );
  }
});
