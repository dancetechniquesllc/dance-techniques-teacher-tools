const CACHE = "dt-parent-portal-secure-family-v45";
const APP_SHELL = [
  "./",
  "./index.html",
  "./parent-auth.js",
  "./manifest.webmanifest",
  "./assets/brand/dance-techniques-logo.png",
  "./assets/messages.png",
  "./assets/schedule.png",
  "./assets/boutique.png",
  "./assets/payments.png",
  "./assets/login-elements/unlinked-family-account.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request, { cache: "no-store" }).then((response) => {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put("./index.html", copy));
      return response;
    }).catch(() => caches.match("./index.html")));
    return;
  }
  // Always prefer the newest connected preview. The cached shell is only a
  // graceful fallback when the Parent Portal is opened without a connection.
  event.respondWith(fetch(event.request).then((response) => {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request)));
});

self.addEventListener("push", (event) => {
  const payload = event.data?.json?.() || {};
  event.waitUntil(self.registration.showNotification(payload.title || "Dance Techniques", {
    body: payload.body || "",
    icon: "./assets/brand/dance-techniques-logo.png",
    badge: "./assets/brand/dance-techniques-logo.png",
    tag: payload.tag || "parent-portal",
    data: { url: payload.url || "./?open=boutique" }
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url || "./?open=boutique"));
});
