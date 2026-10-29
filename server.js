// Repvo server: plain Node, no dependencies.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const config = require("./lib/config");
const { db, getSetting, setSetting, listFoods, replaceFoods, logEvent, DEFAULTS } = require("./lib/db");
const E = require("./lib/engine");
const O = require("./lib/orders");
const pay = require("./lib/payments");
const T = require("./lib/time");
const A = require("./lib/accounts");
const P = require("./lib/posts");
const BLOG = require("./lib/blog");

const PUBLIC = path.join(__dirname, "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json", ".txt": "text/plain; charset=utf-8" };
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-src https://www.youtube-nocookie.com https://player.vimeo.com; media-src https:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";

/* ---------- helpers ---------- */
function send(res, status, body, headers = {}) {
  const isObj = typeof body === "object" && !Buffer.isBuffer(body);
  res.writeHead(status, {
    "Content-Type": isObj ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    ...headers,
  });
  res.end(isObj ? JSON.stringify(body) : body);
}
const json = (res, body, status = 200) => send(res, status, body);
const redirect = (res, to) => { res.writeHead(302, { Location: to, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }); res.end(); };

function serveFile(res, file, cache = "no-cache") {
  const full = path.join(PUBLIC, file);
  if (!full.startsWith(PUBLIC) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) return send(res, 404, "Not found");
  res.writeHead(200, {
    "Content-Type": TYPES[path.extname(full)] || "application/octet-stream",
    "Cache-Control": cache,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": CSP,
  });
  fs.createReadStream(full).pipe(res);
}

function readBody(req, limit = 256 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", c => { size += c.length; if (size > limit) { reject(Object.assign(new Error("too large"), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
async function readJson(req) {
  const raw = await readBody(req);
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw Object.assign(new Error("Invalid JSON"), { status: 400 }); }
}

// simple in-memory rate limiter
const buckets = new Map();
function limited(key, max, windowMs) {
  const now = Date.now();
  const b = buckets.get(key) || { n: 0, reset: now + windowMs };
  if (now > b.reset) { b.n = 0; b.reset = now + windowMs; }
  b.n++; buckets.set(key, b);
  return b.n > max;
}
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (now > b.reset) buckets.delete(k); }, 60000).unref();
const ipOf = req => (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress;

/* ---------- admin session ---------- */
const sign = v => crypto.createHmac("sha256", config.appSecret).update(v).digest("base64url");
function adminCookie() {
  const v = `admin.${Date.now() + 7 * 86400e3}`;
  return `${v}.${sign(v)}`;
}
function isAdmin(req) {
  const m = (req.headers.cookie || "").match(/(?:^|;\s*)fp_admin=([^;]+)/);
  if (!m) return false;
  const parts = m[1].split(".");
  if (parts.length !== 3) return false;
  const v = parts[0] + "." + parts[1];
  const a = Buffer.from(sign(v)), b = Buffer.from(parts[2]);
  return a.length === b.length && crypto.timingSafeEqual(a, b) && Number(parts[1]) > Date.now();
}
const secure = config.baseUrl.startsWith("https://") ? "; Secure" : "";

/* ---------- public API ---------- */
function publicConfig() {
  const a = getSetting("availability");
  const charge = O.chargeFor(1);
  return {
    brand: config.brand, prices: getSetting("prices"), callMinutes: a.callMinutes, coachTz: a.tz, coachDays: a.days, startHour: a.startHour, endHour: a.endHour,
    chargeCurrency: charge.currency, fxRate: charge.currency === "USD" ? null : charge.rate, provider: config.paymentProvider,
    flags: E.FLAGS, videosOn: !!getSetting("videos").offer,
  };
}

const routes = [];
const on = (method, pattern, handler) => routes.push({ method, re: new RegExp("^" + pattern.replace(/:(\w+)/g, "(?<$1>[^/]+)") + "$"), handler });
const admin = (method, pattern, handler) => on(method, pattern, (req, res, p, q) => (isAdmin(req) ? handler(req, res, p, q) : json(res, { error: "Login required" }, 401)));

// The phone apps send "RepvoApp" in their user agent. Inside the apps nothing is sold:
// clients sign in and see the plans they bought on the website.
const isApp = req => /RepvoApp/.test(req.headers["user-agent"] || "");
on("GET", "/", (req, res) => (isApp(req) ? redirect(res, "/account") : serveFile(res, "index.html")));
on("GET", "/account", (req, res) => serveFile(res, "account.html"));

/* ---------- blog (server-rendered so search engines can read it) ---------- */
const esc = BLOG.esc;
function sitePage(req, { title, desc, lang = "en", body, path, type = "website" }) {
  const url = config.baseUrl + path;
  return `<!doctype html><html lang="${lang}"${lang === "ar" ? ' dir="rtl"' : ""}><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="${type}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url)}"><meta property="og:image" content="${esc(config.baseUrl)}/assets/app/icon-512.png">
<meta name="theme-color" content="#1E56C8"><link rel="icon" href="/assets/icon.svg" type="image/svg+xml"><link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/assets/app/apple-touch-icon.png">
<link rel="alternate" type="application/rss+xml" title="Repvo blog" href="/blog/feed.xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Archivo:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="/assets/style.css"><script src="/assets/theme.js"></script></head><body>
<header class="site"><div class="inner nav">
<a class="logo" href="/" aria-label="Repvo home"><svg class="mark" viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" rx="24" fill="#1E56C8"/><polyline points="22,38 45,74 76,24" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/><polyline points="60,23 77,22 79,39" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="wm">REP<span>V</span>O</span></a>
<nav class="links" aria-label="Main"><a href="/#how">How it works</a><a href="/#pricing">Pricing</a><a href="/#team">Team</a><a href="/blog">Blog</a><a href="/#faq">FAQ</a></nav>
<a class="navlink myplans" href="/account">My plans</a><a class="btn navcta" href="/#start">Get my plan</a></div></header>
<main class="blogwrap">${body}</main>
<footer class="foot"><div class="inner footin"><span><b>Repvo</b> · Lift right. Eat right.</span><span><a href="/blog">Blog</a> · <a href="/terms">Terms, refunds &amp; privacy</a></span></div></footer>
<script src="/assets/motion.js"></script><script src="/assets/pwa.js"></script></body></html>`;
}
const html = (res, status, s, extra = {}) => send(res, status, s, { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": CSP, "X-Frame-Options": "DENY", "Cache-Control": "public, max-age=300", ...extra });
const PRIVATE = { "Cache-Control": "private, no-store", "Vary": "Cookie" }; // pages that differ for clients and visitors
/** Full articles are for clients: someone signed in to My plans with at least one paid plan. */
function isMember(req) {
  const email = A.sessionEmail(req.headers.cookie);
  return !!(email && A.me(email).plans.length);
}
on("GET", "/blog", (req, res, p, q) => {
  const lang = ["en", "ar"].includes(q.get("lang")) ? q.get("lang") : null;
  const tag = String(q.get("tag") || "").slice(0, 40), search = String(q.get("q") || "").trim().slice(0, 80);
  const all = P.list({ limit: 200, withBody: true });
  const qs = new URLSearchParams(Object.entries({ lang, tag, q: search }).filter(([, v]) => v)).toString();
  html(res, 200, sitePage(req, { title: "Blog · Repvo", desc: "Training, nutrition and coaching articles from the Repvo team.", path: "/blog" + (qs ? "?" + qs : ""),
    body: `<div class="bloghead"><p class="eyebrow">Blog</p><h1 class="h2">Train smarter. Eat smarter.</h1><p class="sub2">Short, practical articles from the team behind your plans.</p></div>${BLOG.indexHTML(all, { lang, tag, q: search, locked: !isMember(req) })}` }), PRIVATE);
});
on("GET", "/blog/feed.xml", (req, res) => {
  const items = P.list({ limit: 30 }).map(p => `<item><title>${esc(p.title)}</title><link>${esc(config.baseUrl)}/blog/${esc(p.slug)}</link><guid>${esc(config.baseUrl)}/blog/${esc(p.slug)}</guid><pubDate>${new Date(p.published_at || p.created_at).toUTCString()}</pubDate><description>${esc(p.excerpt)}</description></item>`).join("");
  send(res, 200, `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Repvo blog</title><link>${esc(config.baseUrl)}/blog</link><description>Training and nutrition from the Repvo team</description>${items}</channel></rss>`, { "Content-Type": "application/rss+xml; charset=utf-8" });
});
on("GET", "/blog/:slug", (req, res, p) => {
  const post = P.bySlug(decodeURIComponent(p.slug));
  if (!post) return html(res, 404, sitePage(req, { title: "Not found · Repvo", desc: "", path: "/blog", body: `<div class="bloghead"><h1 class="h2">Article not found</h1><p><a href="/blog">See all articles</a></p></div>` }));
  const related = BLOG.relatedPosts(post, P.list({ limit: 200 }));
  const locked = !isMember(req);
  html(res, 200, sitePage(req, { title: `${post.title} · Repvo`, desc: post.excerpt, lang: post.lang, path: "/blog/" + post.slug, type: "article",
    body: BLOG.postHTML(post, { url: `${config.baseUrl}/blog/${encodeURIComponent(post.slug)}`, related, locked, signHref: "/account?next=" + encodeURIComponent("/blog/" + post.slug) }) }), PRIVATE);
});
on("GET", "/js/blog.js", (req, res) => send(res, 200, fs.readFileSync(path.join(__dirname, "lib", "blog.js"), "utf8"), { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=3600" }));
on("GET", "/api/blog", (req, res, p, q) => json(res, P.list({ lang: q.get("lang"), limit: Number(q.get("limit")) || 20 })));
on("GET", "/api/team", (req, res) => json(res, P.team()));
on("GET", "/sitemap.xml", (req, res) => {
  const u = (loc, d) => `<url><loc>${esc(config.baseUrl + loc)}</loc>${d ? `<lastmod>${new Date(d).toISOString().slice(0, 10)}</lastmod>` : ""}</url>`;
  send(res, 200, `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${u("/")}${u("/blog")}${P.list({ limit: 200 }).map(x => u("/blog/" + x.slug, x.updated_at)).join("")}${u("/terms")}</urlset>`, { "Content-Type": "application/xml; charset=utf-8" });
});
on("GET", "/manifest.webmanifest", (req, res) => serveFile(res, "manifest.webmanifest", "public, max-age=3600"));
on("GET", "/sw.js", (req, res) => serveFile(res, "sw.js", "no-cache"));
on("GET", "/offline", (req, res) => serveFile(res, "offline.html"));
on("GET", "/admin", (req, res) => serveFile(res, "admin.html"));
on("GET", "/plan/:token", (req, res) => serveFile(res, "plan.html"));
on("GET", "/terms", (req, res) => serveFile(res, "terms.html"));
on("GET", "/robots.txt", (req, res) => send(res, 200, "User-agent: *\nDisallow: /plan/\nDisallow: /admin\nDisallow: /pay/\nDisallow: /account\nSitemap: " + config.baseUrl + "/sitemap.xml\n"));
on("GET", "/health", (req, res) => json(res, { ok: true }));

on("GET", "/api/config", (req, res) => json(res, publicConfig()));
on("GET", "/api/foods", (req, res, p, q) => {
  const reg = q.get("region") === "eg" ? "eg" : "intl";
  json(res, E.eligibleFoods(listFoods(), reg, []).filter(f => f.cat !== "other").map(f => ({ id: f.id, name: f.name, cat: f.cat, slots: f.slots })));
});
on("GET", "/api/slots", (req, res) => json(res, O.allSlots()));
on("POST", "/api/checkout", async (req, res) => {
  if (limited("co:" + ipOf(req), Number(process.env.CHECKOUT_RATE_LIMIT) || 20, 15 * 60e3)) return json(res, { error: "Too many attempts. Please wait a few minutes." }, 429);
  const r = await O.checkout(await readJson(req));
  json(res, r, r.error ? 400 : 200);
});
on("GET", "/api/order/:token", (req, res, p) => {
  const v = O.orderView(p.token);
  if (v && isApp(req)) { v.upgrades = []; v.app = true; }
  v ? json(res, v) : json(res, { error: "Not found" }, 404);
});

/* ---------- client accounts (website "My plans" and the phone apps) ---------- */
const clientCookie = (v, maxAge) => `rv_client=${v}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
on("POST", "/api/auth/code", async (req, res) => {
  const b = await readJson(req);
  if (limited("ac:" + ipOf(req), Number(process.env.LOGIN_RATE_LIMIT) || 10, 15 * 60e3) || limited("ae:" + A.norm(b.email), 5, 60 * 60e3)) return json(res, { error: "Too many codes asked for. Please wait a few minutes." }, 429);
  const r = await A.requestCode(b.email, b.lang);
  json(res, r, r.error ? 400 : 200);
});
on("POST", "/api/auth/verify", async (req, res) => {
  if (limited("av:" + ipOf(req), Number(process.env.LOGIN_RATE_LIMIT) || 20, 15 * 60e3)) return json(res, { error: "Too many attempts. Please wait a few minutes." }, 429);
  const b = await readJson(req);
  const r = A.verifyCode(b.email, b.code);
  if (r.error) return json(res, r, 400);
  send(res, 200, { ok: true }, { "Set-Cookie": clientCookie(r.session, r.maxAge) });
});
on("POST", "/api/auth/logout", (req, res) => send(res, 200, { ok: true }, { "Set-Cookie": clientCookie("", 0) }));
on("GET", "/api/me", (req, res) => {
  const email = A.sessionEmail(req.headers.cookie);
  if (!email) return json(res, { error: "Not signed in" }, 401);
  const me = A.me(email), app = isApp(req);
  // the phone apps sell nothing; the website shows what each plan can still add
  me.plans.forEach(p => { p.upgrades = app ? [] : O.upgradesForToken(p.token); });
  json(res, { ...me, app });
});
on("POST", "/api/me/delete", async (req, res) => {
  const email = A.sessionEmail(req.headers.cookie);
  if (!email) return json(res, { error: "Not signed in" }, 401);
  const b = await readJson(req);
  if (String(b.confirm || "").trim().toUpperCase() !== "DELETE") return json(res, { error: "Type DELETE to confirm." }, 400);
  const r = await A.deleteAccount(email, id => pay.stripe.cancelSubscription(id));
  send(res, 200, r, { "Set-Cookie": clientCookie("", 0) });
});
on("POST", "/api/order/:token/addon", async (req, res, p) => {
  if (limited("addon:" + ipOf(req), 20, 15 * 60e3)) return json(res, { error: "Too many attempts. Please wait a few minutes." }, 429);
  const b = await readJson(req);
  if (isApp(req)) return json(res, { error: "Add-ons are bought on the website." }, 400);
  const r = await O.buyAddon(p.token, String(b.feature || ""), b.slot);
  json(res, r, r.error ? 400 : 200);
});
// training tracker
on("GET", "/api/order/:token/train", (req, res, p) => { const r = O.trainGet(p.token); r ? json(res, r) : json(res, { error: "Not found" }, 404); });
on("POST", "/api/order/:token/train", async (req, res, p) => { const r = O.trainSave(p.token, await readJson(req)); json(res, r, r.error ? 400 : 200); });
on("DELETE", "/api/order/:token/train/:id", (req, res, p) => (O.trainDelete(p.token, p.id) ? json(res, { ok: true }) : json(res, { error: "Not found" }, 404)));
// nutrition tracker
on("GET", "/api/order/:token/foods", (req, res, p) => { const r = O.foodList(p.token); r ? json(res, r) : json(res, { error: "Not found" }, 404); });
on("GET", "/api/order/:token/food", (req, res, p, q) => { const r = O.foodDay(p.token, q.get("date")); r ? json(res, r) : json(res, { error: "Not found" }, 404); });
on("POST", "/api/order/:token/food", async (req, res, p) => { const r = O.foodAdd(p.token, await readJson(req)); json(res, r, r.error ? 400 : 200); });
on("DELETE", "/api/order/:token/food/:id", (req, res, p) => (O.foodDelete(p.token, p.id) ? json(res, { ok: true }) : json(res, { error: "Not found" }, 404)));
// weekly calls for follow-up clients
on("GET", "/api/order/:token/weekly", (req, res, p) => { const r = O.weeklyView(p.token); r ? json(res, r) : json(res, { error: "Not found" }, 404); });
on("POST", "/api/order/:token/weekly", async (req, res, p) => { const r = await O.bookWeekly(p.token, (await readJson(req)).slot); json(res, r, r.error ? 400 : 200); });
on("DELETE", "/api/order/:token/weekly/:id", (req, res, p) => { const r = O.cancelWeekly(p.token, p.id); json(res, r, r.error ? 400 : 200); });
on("POST", "/api/order/:token/swap", async (req, res, p) => {
  const b = await readJson(req);
  if (!O.swap(p.token, Number(b.meal), String(b.role))) return json(res, { error: "Can't swap" }, 400);
  json(res, O.orderView(p.token));
});

// Pay (or retry paying) a pending order — used in renewal emails.
on("GET", "/pay/:token", async (req, res, p) => {
  if (p.token === "mock") return send(res, 404, "Not found");
  const r = await O.payLink(p.token);
  if (r.url) return redirect(res, r.url);
  if (r.paid) return redirect(res, r.order.kind === "plan" ? `/plan/${r.order.token}` : `/plan/${p.token}`);
  redirect(res, `/plan/${p.token}`);
});

/* ---------- mock gateway (testing only) ---------- */
on("GET", "/pay/mock/:token", (req, res) => (config.paymentProvider === "mock" ? serveFile(res, "mock-pay.html") : send(res, 404, "Not found")));
on("POST", "/api/mock/:token", async (req, res, p) => {
  if (config.paymentProvider !== "mock") return send(res, 404, "Not found");
  const o = db.prepare("SELECT id,token,kind,sub_id,parent_id,status FROM orders WHERE token=?").get(p.token);
  if (!o) return json(res, { error: "Not found" }, 404);
  const b = await readJson(req);
  if (b.result === "pay") await O.markPaid(o.id, "mock_txn_" + Date.now());
  else O.markFailed(o.id, "mock");
  const land = b.result === "pay" ? O.landingToken(o) : o.token;
  json(res, { next: `/plan/${land}` + (b.result === "pay" ? "" : "?cancelled=1") });
});

/* ---------- Paymob ---------- */
on("POST", "/webhooks/paymob", async (req, res, p, q) => {
  let body; try { body = JSON.parse(await readBody(req)); } catch { return json(res, { ok: false }, 400); }
  const r = pay.paymob.parseWebhook(Object.fromEntries(q), body);
  if (!r) return json(res, { ok: true }); // not a transaction callback
  if (r.bad) { console.warn("[paymob] bad HMAC on webhook"); return json(res, { ok: false }, 401); }
  if (r.paid) await O.markPaid(r.orderId, "paymob_" + r.ref); else O.markFailed(r.orderId, "paymob_" + r.ref);
  json(res, { ok: true });
});
on("GET", "/return/paymob", async (req, res, p, q) => {
  const r = pay.paymob.parseReturn(Object.fromEntries(q));
  if (r.bad || !r.orderId) return redirect(res, "/?payment=unknown");
  if (r.paid) await O.markPaid(r.orderId, "paymob_" + r.ref);
  const o = db.prepare("SELECT token, kind, parent_id FROM orders WHERE id=?").get(r.orderId);
  redirect(res, o ? `/plan/${r.paid ? O.landingToken(o) : o.token}${r.paid ? "" : "?cancelled=1"}` : "/");
});

/* ---------- Stripe ---------- */
on("POST", "/webhooks/stripe", async (req, res) => {
  const raw = await readBody(req);
  const ev = pay.stripe.verify(raw, req.headers["stripe-signature"]);
  if (!ev) return json(res, { ok: false }, 400);
  const o = ev.data?.object || {};
  try {
    if (ev.type === "checkout.session.completed" || ev.type === "checkout.session.async_payment_succeeded") {
      const id = o.metadata?.order_id || o.client_reference_id;
      if (id && (o.payment_status === "paid" || o.payment_status === "no_payment_required")) await O.markPaid(id, "stripe_" + o.id, { stripeSub: o.subscription || null });
    } else if (ev.type === "invoice.paid" && o.billing_reason === "subscription_cycle") {
      O.stripeRenewalPaid(o.subscription || o.parent?.subscription_details?.subscription, o);
    } else if (ev.type === "invoice.payment_failed" && o.subscription) {
      O.stripeSubStatus(o.subscription, "past_due");
    } else if (ev.type === "customer.subscription.deleted") {
      O.stripeSubStatus(o.id, "cancelled");
    }
  } catch (e) { console.error("[stripe webhook]", e); return json(res, { ok: false }, 500); }
  json(res, { ok: true });
});

/* ---------- admin API ---------- */
on("POST", "/api/admin/login", async (req, res) => {
  if (limited("login:" + ipOf(req), 10, 15 * 60e3)) return json(res, { error: "Too many attempts. Wait 15 minutes." }, 429);
  const b = await readJson(req);
  if (!config.adminPassword) return json(res, { error: "Set ADMIN_PASSWORD on the server first." }, 400);
  const a = crypto.createHash("sha256").update(String(b.password || "")).digest(), e = crypto.createHash("sha256").update(config.adminPassword).digest();
  if (!crypto.timingSafeEqual(a, e)) return json(res, { error: "Wrong password." }, 401);
  send(res, 200, { ok: true }, { "Set-Cookie": `fp_admin=${adminCookie()}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${7 * 86400}${secure}` });
});
on("POST", "/api/admin/logout", (req, res) => send(res, 200, { ok: true }, { "Set-Cookie": `fp_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}` }));
on("GET", "/api/admin/me", (req, res) => json(res, { admin: isAdmin(req), provider: config.paymentProvider, missing: pay.active().ready(), mail: !!config.mail.resendKey, coachEmail: config.mail.coachEmail || null, baseUrl: config.baseUrl }));

admin("GET", "/api/admin/overview", (req, res) => {
  const now = Date.now(), d30 = now - 30 * 86400e3;
  const one = (sql, ...a) => db.prepare(sql).get(...a);
  json(res, {
    revenue30: one("SELECT COALESCE(SUM(total_usd),0) v FROM orders WHERE status='paid' AND paid_at>=?", d30).v,
    orders30: one("SELECT COUNT(*) v FROM orders WHERE status='paid' AND kind='plan' AND paid_at>=?", d30).v,
    revenueAll: one("SELECT COALESCE(SUM(total_usd),0) v FROM orders WHERE status='paid'").v,
    activeFollow: one("SELECT COUNT(*) v FROM subscriptions WHERE status='active'").v,
    upcomingCalls: one("SELECT COUNT(*) v FROM bookings WHERE status='confirmed' AND ts>=?", now).v,
    needsReview: one("SELECT COUNT(*) v FROM orders WHERE status='paid' AND flagged=1 AND paid_at>=?", d30).v,
    byPkg: db.prepare("SELECT pkg, COUNT(*) n, SUM(total_usd) usd FROM orders WHERE status='paid' AND kind='plan' AND paid_at>=? GROUP BY pkg").all(d30),
  });
});
admin("GET", "/api/admin/orders", (req, res, p, q) => {
  const status = q.get("status"), s = (q.get("q") || "").trim();
  const where = [], args = [];
  if (status && status !== "all") { where.push("status=?"); args.push(status); }
  if (s) { where.push("(id LIKE ? OR name LIKE ? OR email LIKE ? OR phone LIKE ?)"); args.push(...Array(4).fill(`%${s}%`)); }
  const rows = db.prepare(`SELECT id,token,kind,created_at,status,provider,name,email,phone,wa,pkg,flagged,follow,call_ts,total_usd,charge_amount,charge_currency,paid_at,features FROM orders ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY created_at DESC LIMIT 300`).all(...args);
  json(res, rows);
});
admin("GET", "/api/admin/orders/:id", (req, res, p) => {
  const o = db.prepare("SELECT * FROM orders WHERE id=?").get(p.id);
  if (!o) return json(res, { error: "Not found" }, 404);
  const view = O.orderView(o.token);
  json(res, { ...view, token: o.token, provider: o.provider, providerRef: o.provider_ref, intake: O.J(o.intake), excluded: O.J(o.excluded),
    events: db.prepare("SELECT at,type,detail FROM events WHERE order_id=? ORDER BY id").all(o.id),
    bookings: db.prepare("SELECT * FROM bookings WHERE order_id=? ORDER BY id").all(o.id),
    sub: db.prepare("SELECT * FROM subscriptions WHERE order_id=? OR id=?").get(o.id, o.sub_id || "") });
});
admin("POST", "/api/admin/orders/:id/resend", async (req, res, p) => {
  const o = db.prepare("SELECT * FROM orders WHERE id=?").get(p.id);
  if (!o || o.status !== "paid") return json(res, { error: "Only paid orders" }, 400);
  const sub = db.prepare("SELECT * FROM subscriptions WHERE order_id=? OR id=?").get(o.id, o.sub_id || "");
  await O.sendPaidEmails({ order: o, sub });
  json(res, { ok: true });
});
admin("POST", "/api/admin/orders/:id/mark-paid", async (req, res, p) => {
  const r = await O.markPaid(p.id, "manual_" + Date.now());
  if (r.missing) return json(res, { error: "Not found" }, 404);
  logEvent(p.id, "marked_paid_manually");
  json(res, { ok: true });
});
admin("GET", "/api/admin/bookings", (req, res, p, q) => {
  const scope = q.get("scope") || "upcoming";
  const now = Date.now();
  const sql = scope === "past"
    ? "SELECT b.*, o.name, o.email, o.wa, o.token, o.flagged, o.client_tz FROM bookings b JOIN orders o ON o.id=b.order_id WHERE b.status IN ('confirmed','done','cancelled') AND b.ts<? ORDER BY b.ts DESC LIMIT 200"
    : "SELECT b.*, o.name, o.email, o.wa, o.token, o.flagged, o.client_tz FROM bookings b JOIN orders o ON o.id=b.order_id WHERE b.status IN ('confirmed','held') AND b.ts>=? ORDER BY b.ts LIMIT 200";
  json(res, db.prepare(sql).all(scope === "past" ? now : now - 3600e3));
});
admin("PATCH", "/api/admin/bookings/:id", async (req, res, p) => {
  const b = await readJson(req);
  const bk = db.prepare("SELECT * FROM bookings WHERE id=?").get(Number(p.id));
  if (!bk) return json(res, { error: "Not found" }, 404);
  if (b.ts) {
    const ts = Number(b.ts);
    if (O.takenSet().has(ts) && ts !== bk.ts) return json(res, { error: "That time is taken." }, 400);
    db.prepare("UPDATE bookings SET ts=?, note=NULL WHERE id=?").run(ts, bk.id);
    db.prepare("UPDATE orders SET call_ts=? WHERE id=?").run(ts, bk.order_id);
    logEvent(bk.order_id, "call_rescheduled", { from: bk.ts, to: ts });
  }
  if (b.status && ["confirmed", "done", "cancelled"].includes(b.status)) {
    db.prepare("UPDATE bookings SET status=? WHERE id=?").run(b.status, bk.id);
    logEvent(bk.order_id, "call_" + b.status);
  }
  json(res, { ok: true });
});
admin("GET", "/api/admin/posts", (req, res) => json(res, P.list({ all: true, limit: 200 })));
admin("POST", "/api/admin/posts", async (req, res) => { const r = P.create(await readJson(req)); json(res, r, r.error ? 400 : 200); });
admin("PUT", "/api/admin/posts/:id", async (req, res, p) => { const r = P.update(Number(p.id), await readJson(req)); json(res, r, r.error ? 400 : 200); });
admin("DELETE", "/api/admin/posts/:id", (req, res, p) => { const r = P.remove(Number(p.id)); json(res, r, r.error ? 404 : 200); });
admin("GET", "/api/admin/team", (req, res) => json(res, { members: P.team() }));
admin("PUT", "/api/admin/team", async (req, res) => { const r = P.setTeam((await readJson(req)).members); json(res, r, r.error ? 400 : 200); });
admin("GET", "/api/admin/subscriptions", (req, res) => json(res, db.prepare("SELECT s.*, o.token FROM subscriptions s JOIN orders o ON o.id=s.order_id ORDER BY s.created_at DESC").all()));
admin("POST", "/api/admin/subscriptions/:id/cancel", async (req, res, p) => {
  const s = db.prepare("SELECT * FROM subscriptions WHERE id=?").get(p.id);
  if (!s) return json(res, { error: "Not found" }, 404);
  if (s.provider === "stripe" && s.provider_sub_id) {
    try { await pay.stripe.cancelSubscription(s.provider_sub_id); } catch (e) { return json(res, { error: "Stripe: " + e.message }, 502); }
  }
  db.prepare("UPDATE subscriptions SET status='cancelled' WHERE id=?").run(s.id);
  if (s.pending_order_id) db.prepare("UPDATE orders SET status='expired' WHERE id=? AND status='pending'").run(s.pending_order_id);
  logEvent(s.order_id, "follow_cancelled", { sub: s.id });
  json(res, { ok: true });
});
admin("GET", "/api/admin/settings", (req, res) => json(res, { prices: getSetting("prices"), availability: getSetting("availability"), fx: getSetting("fx"), chargeCurrency: O.chargeFor(1).currency }));
admin("GET", "/api/admin/videos", (req, res) => {
  const v = getSetting("videos");
  json(res, { offer: !!v.offer, exercises: E.allExercises().map(ex => ({ ex, url: (v.urls || {})[ex] || "", ok: !!E.videoEmbed((v.urls || {})[ex]), cues: E.EX_CUES[ex] || [] })) });
});
admin("PUT", "/api/admin/videos", async (req, res) => {
  const b = await readJson(req);
  const names = new Set(E.allExercises()), urls = {};
  for (const [ex, url] of Object.entries(b.urls || {})) {
    if (!names.has(ex)) continue;
    if (!url) { urls[ex] = ""; continue; }
    const u = String(url).trim().slice(0, 500);
    if (!E.videoEmbed(u)) return json(res, { error: `"${ex}": use a YouTube, Vimeo, or https .mp4/.webm link.` }, 400);
    urls[ex] = u;
  }
  setSetting("videos", { offer: !!b.offer, urls });
  json(res, { ok: true });
});
admin("PUT", "/api/admin/settings", async (req, res) => {
  const b = await readJson(req);
  if (b.prices) {
    const p = {};
    for (const k of Object.keys(DEFAULTS.prices)) { const v = Number(b.prices[k]); if (!isFinite(v) || v < 0 || v > 10000) return json(res, { error: `Bad price for ${k}` }, 400); p[k] = Math.round(v * 100) / 100; }
    setSetting("prices", p);
  }
  if (b.availability) {
    const a = b.availability;
    const days = (a.days || []).map(Number).filter(d => d >= 0 && d <= 6);
    const v = { tz: T.validTz(a.tz) ? a.tz : "Africa/Cairo", days: [...new Set(days)], startHour: clampInt(a.startHour, 0, 23), endHour: clampInt(a.endHour, 0, 23),
      callMinutes: clampInt(a.callMinutes, 10, 120), horizonDays: clampInt(a.horizonDays, 1, 60), minNoticeHours: clampInt(a.minNoticeHours, 0, 168) };
    if (v.endHour < v.startHour) return json(res, { error: "Last call start must be after the first." }, 400);
    setSetting("availability", v);
  }
  if (b.fx) {
    const r = Number(b.fx.usdToEgp);
    if (!isFinite(r) || r <= 0) return json(res, { error: "Bad exchange rate" }, 400);
    setSetting("fx", { usdToEgp: r });
  }
  json(res, { ok: true });
});
const clampInt = (v, a, b) => Math.min(b, Math.max(a, Math.round(Number(v) || 0)));
admin("GET", "/api/admin/foods", (req, res) => json(res, listFoods()));
admin("PUT", "/api/admin/foods", async (req, res) => {
  const b = await readJson(req);
  if (!Array.isArray(b.foods) || !b.foods.length) return json(res, { error: "Keep at least one food." }, 400);
  const clean = [];
  const seen = new Set();
  for (const f of b.foods) {
    const name = String(f.name || "").trim().slice(0, 80);
    if (!name) return json(res, { error: "Every food needs a name." }, 400);
    if (!E.CATS.includes(f.cat)) return json(res, { error: `Bad type for ${name}` }, 400);
    let id = String(f.id || "").replace(/[^\w-]/g, "").slice(0, 40) || "u" + crypto.randomBytes(4).toString("hex");
    if (seen.has(id)) id = "u" + crypto.randomBytes(4).toString("hex");
    seen.add(id);
    const n = k => { const v = Number(f[k]); return isFinite(v) && v >= 0 ? v : 0; };
    clean.push({ id, name, cat: f.cat, kcal: n("kcal"), p: n("p"), c: n("c"), f: n("f"), slots: f.cat === "other" ? "" : String(f.slots || "").toUpperCase().replace(/[^BLDS]/g, "").split("").filter((c, i, a) => a.indexOf(c) === i).join(""),
      unit: String(f.unit || "").slice(0, 20), unitG: n("unitG"), reg: ["all", "eg", "intl"].includes(f.reg) ? f.reg : "all",
      style: E.STYLES.includes(f.style) ? f.style : "any", mins: Math.min(240, Math.round(n("mins"))), prep: String(f.prep || "").slice(0, 300),
      nameAr: String(f.nameAr || "").trim().slice(0, 80), prepAr: String(f.prepAr || "").slice(0, 300) });
  }
  replaceFoods(clean);
  json(res, { ok: true, foods: listFoods() });
});
admin("POST", "/api/admin/foods/reset", (req, res) => { replaceFoods(E.STARTER_FOODS); json(res, { ok: true, foods: listFoods() }); });
admin("GET", "/api/admin/outbox", (req, res) => json(res, db.prepare("SELECT id,created_at,to_addr,subject,status,error FROM outbox ORDER BY id DESC LIMIT 100").all()));
admin("GET", "/api/admin/outbox/:id", (req, res, p) => {
  const m = db.prepare("SELECT html FROM outbox WHERE id=?").get(Number(p.id));
  m ? send(res, 200, m.html, { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:" }) : send(res, 404, "Not found");
});

/* ---------- server ---------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (req.method === "GET" && url.pathname.startsWith("/assets/")) return serveFile(res, url.pathname.slice(1), "public, max-age=3600");
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = url.pathname.match(r.re);
      if (m) return await r.handler(req, res, m.groups || {}, url.searchParams);
    }
    send(res, 404, "Not found");
  } catch (e) {
    console.error("[error]", req.method, url.pathname, e);
    if (!res.headersSent) json(res, { error: e.status ? e.message : "Something went wrong." }, e.status || 500);
  }
});

if (require.main === module) {
  server.listen(config.port, () => {
    console.log(`${config.brand} running on ${config.baseUrl} (port ${config.port}) · payments: ${config.paymentProvider}`);
    const missing = pay.active().ready();
    if (missing.length) console.warn("⚠ Payment provider is missing settings:", missing.join(", "));
    if (config.paymentProvider === "mock") console.warn("⚠ PAYMENT_PROVIDER=mock: orders are marked paid without charging anyone. Use only for testing.");
    if (!config.adminPassword) console.warn("⚠ ADMIN_PASSWORD is not set: the admin page is locked.");
    if (!config.mail.resendKey) console.warn("⚠ RESEND_API_KEY is not set: emails are saved in the admin Outbox but not sent.");
  });
  const run = () => O.tick().catch(e => console.error("[tick]", e));
  setTimeout(run, 5000);
  setInterval(run, 5 * 60e3);
}

module.exports = { server };
