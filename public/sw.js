// Service worker.
//
// IMPORTANT: never cache HTML navigations. The portal's pages are dynamic and
// per-user (auth'd via cookies) — caching them made the installed PWA serve a
// stale page (e.g. a dashboard from before the self check-in shipped, so the
// "I'm in" card went missing). Navigations and data requests therefore always
// go to the network; only immutable build assets are cached.
const CACHE = "myportal-v3";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Only content-hashed / immutable build output is safe to cache. */
function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icon") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".ico") ||
    url.pathname.endsWith(".woff2")
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // pass cross-origin through

  // Navigations and dynamic/data requests: always network (no stale HTML in the
  // PWA). Leaving the event un-responded uses the browser's default fetch.
  if (request.mode === "navigate" || !isStaticAsset(url)) return;

  // Static build assets are immutable — cache-first for speed/offline.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
          return res;
        }),
    ),
  );
});

// --- Emergency push notifications -------------------------------------------
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "Emergency alert", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Emergency alert";
  const options = {
    body: data.body || "",
    icon: "/icon.svg",
    badge: "/icon.svg",
    tag: data.tag || "eess-alert",
    renotify: true,
    requireInteraction: data.severity === "critical",
    vibrate: [200, 100, 200],
    data: { url: data.url || "/emergency" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/emergency";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        for (const client of list) {
          if (client.url.includes(url) && "focus" in client) return client.focus();
        }
        if (self.clients.openWindow) return self.clients.openWindow(url);
      }),
  );
});
