// Repvo service worker: makes the site installable and keeps plans you've
// opened readable without internet. Payments, admin and sign-in always go
// to the network.
const VERSION = "repvo-static-v1";
const SHELL = ["/offline", "/assets/style.css", "/assets/plan.js", "/assets/static-data.js", "/assets/static-demo.js", "/js/blog.js", "/assets/account.js", "/assets/motion.js", "/assets/theme.js", "/assets/pwa.js", "/assets/icon.svg", "/assets/app/icon-192.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const keep = async (req, res) => { if (res && res.ok) { const c = await caches.open(VERSION); await c.put(req, res.clone()); } return res; };
const networkFirst = async (req, fallback) => {
  try { return await keep(req, await fetch(req)); }
  catch { return (await caches.match(req)) || (fallback ? caches.match(fallback) : Response.error()); }
};

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const p = url.pathname;
  if (p.startsWith("/admin") || p.startsWith("/api/admin") || p.startsWith("/pay") || p.startsWith("/return") || p.startsWith("/webhooks") || p.startsWith("/api/me") || p.startsWith("/api/auth")) return;
  // plan pages and the plan data: fresh when online, last copy when offline
  if (req.mode === "navigate") {
    if (p.startsWith("/plan/") || p === "/account" || p === "/" || p === "/terms") return e.respondWith(networkFirst(req, "/offline"));
    return e.respondWith(fetch(req).catch(() => caches.match("/offline")));
  }
  if (/^\/api\/order\/[^/]+$/.test(p) || /^\/api\/order\/[^/]+\/(train|foods)$/.test(p)) return e.respondWith(networkFirst(req));
  if (p.startsWith("/assets/")) return e.respondWith(caches.match(req).then(hit => { const net = keep(req, fetch(req)).catch(() => hit); return hit || net; }));
});
