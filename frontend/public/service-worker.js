const CACHE_NAME = "vestora-v210";
const assetUrl = (path) => new URL(path, self.registration.scope).toString();
const SHELL = [
  "",
  "index.html",
  "manifest.webmanifest",
  "pwa-icon-192.png",
  "pwa-icon-512.png",
  "uvpro-logo-red.png",
  "menu/paneer-tikka-bowl.jpg",
  "menu/hyderabadi-biryani.jpg",
  "menu/tandoori-platter.jpg",
  "menu/masala-chaas.jpg",
  "menu/filter-coffee.jpg",
  "menu/gulab-jamun.jpg",
].map(assetUrl);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  // Authenticated API responses must never be cached as offline page assets.
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.includes("/functions/") || url.pathname.includes("/rest/") || event.request.headers.has("authorization")) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match(assetUrl(""))))
  );
});
