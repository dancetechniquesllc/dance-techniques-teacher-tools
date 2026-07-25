const CACHE_NAME = "my-dance-techniques-v184-teacher-color-fallback";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./supabase-auth.js?v=20260723-auto-update",
  "./data/partner-schools.js",
  "./dt-touch/dt-touch.js?v=20260722c",
  "./config/dt-touch-voice.json",
  "./assets/app-icon-192.png?v=20260723-full-bleed-icon",
  "./assets/app-icon-512.png?v=20260723-full-bleed-icon",
  "./assets/apple-touch-icon.png?v=20260723-full-bleed-icon",
  "./assets/favicon-64.png?v=20260723-full-bleed-icon",
  "./assets/app-icon-my-day.png",
  "./assets/app-icon-rosters.png",
  "./assets/app-icon-music.png",
  "./assets/app-icon-curriculum.png",
  "./assets/app-icon-schedule.png",
  "./assets/app-icon-messages.png",
  "./assets/dance-techniques-logo-only.png",
  "./assets/app-icon-payday.png",
  "./assets/app-icon-partner-schools.png",
  "./assets/dance-techniques-blush-logo.png",
  "./assets/dance-techniques-logo-only.png",
  "./assets/team-talk-blush-logo.png",
  "./assets/director-dashboard-title.png",
  "./assets/birthday-crown-ring.png",
  "./assets/birthday-crown-ring-sage.png",
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

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch (error) { payload = { body: event.data?.text() || "" }; }
  const title = payload.title || "Dance Techniques";
  const options = {
    body: payload.body || "You have a new notification.",
    icon: "./assets/app-icon-192.png?v=20260723-full-bleed-icon",
    badge: "./assets/favicon-64.png?v=20260723-full-bleed-icon",
    data: { url: payload.url || "./?open=notifications", notificationId: payload.notificationId || "" },
    tag: payload.tag || payload.notificationId || "dance-techniques",
    renotify: Boolean(payload.urgent)
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "./?open=notifications", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => client.url.startsWith(self.location.origin));
    if (existing) return existing.focus().then(() => existing.navigate(target));
    return self.clients.openWindow(target);
  }));
});
