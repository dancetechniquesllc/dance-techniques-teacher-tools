const CACHE_NAME = "my-dance-techniques-v4-password-recovery";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./supabase-auth.js?v=20260720-recovery",
  "./data/partner-schools.js",
  "./assets/teacher-tool-logo.png",
  "./assets/dance-techniques-blush-logo.png",
  "./assets/teacher-tools-sign-in-background.png",
  "./assets/my-dance-techniques/dt-main-logo.png",
  "./assets/my-dance-techniques/blush-logo-exact.png",
  "./assets/my-dance-techniques/floral-corner-top-left.png",
  "./assets/my-dance-techniques/ballet-shoes-top-right.png",
  "./assets/my-dance-techniques/floral-corner-bottom-left.png",
  "./assets/my-dance-techniques/floral-corner-bottom-right.png",
  "./assets/my-dance-techniques/gold-sparkles.png",
  "./assets/my-dance-techniques/parent-portal-illustration.png",
  "./assets/my-dance-techniques/teacher-tools-illustration.png",
  "./assets/my-dance-techniques/director-dashboard-illustration.png",
  "./assets/my-dance-techniques/coming-soon-banner.png",
  "./assets/my-dance-techniques/coming-soon-banner-v2.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy));
          return response;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request).then((response) => {
        if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
        return response;
      });
      return cached || network;
    })
  );
});
