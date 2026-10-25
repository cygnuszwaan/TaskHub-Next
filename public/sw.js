// Caches the app shell only, so the installed app opens without a network. Task data is never cached: it comes from
// the functions on another origin, which this worker does not touch. Network first, so a deploy shows at once.
const CACHE = "taskhub-shell-v1";
const SHELL = ["/index.html", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

// Whether a request is a shell file this worker may cache: a same-origin GET for one of the SHELL paths.
function isShellRequest(method, url, origin) {
  if (method !== "GET") return false;
  const u = new URL(url);
  return u.origin === origin && SHELL.includes(u.pathname);
}

// What a push shows. The server sends data-only FCM messages (functions/push.js), which arrive as {data: {title, body,
// url, tag}}; a message with a `notification` block is read the same way. Returns {title, options} for
// showNotification; the link is kept in options.data.url.
function notificationFromPush(payload) {
  const source = payload && typeof payload === "object" ? (payload.data || payload.notification || {}) : {};
  const text = (v, fallback) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 300) : fallback);
  const options = {
    body: text(source.body, ""),
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: {url: text(source.url, "/")},
  };
  const tag = text(source.tag, "");
  if (tag) options.tag = tag;
  return {title: text(source.title, "TaskHub"), options};
}

// Where a tap on a notification goes: the link when it stays on this site, else the page itself.
function notificationTarget(url, origin) {
  if (typeof url !== "string") return "/";
  try {
    const u = new URL(url, origin);
    return u.origin === origin ? u.pathname + u.search + u.hash : "/";
  } catch (err) {
    return "/";
  }
}

self.addEventListener("push", event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (err) { /* not JSON: show the default */ }
  const {title, options} = notificationFromPush(payload);
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = notificationTarget((event.notification.data || {}).url, self.location.origin);
  event.waitUntil(
    self.clients.matchAll({type: "window", includeUncontrolled: true}).then(windows => {
      const open = windows.find(w => w.url.startsWith(self.location.origin));
      if (open) return open.focus().then(w => (w && target !== "/" && w.navigate ? w.navigate(target) : w));
      return self.clients.openWindow(target);
    })
  );
});

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => Promise.all(SHELL.map(path => cache.add(path).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  const origin = self.location.origin;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== origin) return;
  if (req.mode === "navigate") {
    // Any page address serves the one page; keep the latest copy and fall back to it when offline.
    if (url.pathname.startsWith("/__/")) return; // Firebase Auth's own pages
    event.respondWith(
      fetch(req)
        .then(res => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(cache => cache.put("/index.html", copy));
          }
          return res;
        })
        .catch(() => caches.match("/index.html").then(hit => hit || Response.error()))
    );
    return;
  }
  if (!isShellRequest(req.method, req.url, origin)) return;
  event.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || Response.error()))
  );
});

if (typeof module !== "undefined") module.exports = {CACHE, SHELL, isShellRequest, notificationFromPush, notificationTarget};
