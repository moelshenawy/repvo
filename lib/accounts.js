// Client accounts without passwords: the client types the email they ordered
// with, gets a 6-digit code by email, and is signed in for 90 days. Used by the
// website's "My plans" page and by the phone apps. Includes account deletion,
// which Apple and Google require for apps with sign-in.
const crypto = require("node:crypto");
const config = require("./config");
const { db, logEvent } = require("./db");
const mail = require("./mail");
const E = require("./engine");

db.exec(`CREATE TABLE IF NOT EXISTS login_codes (
  email TEXT PRIMARY KEY, code_hash TEXT NOT NULL, expires INTEGER NOT NULL, tries INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);`);

const CODE_MINUTES = 15, MAX_TRIES = 5, SESSION_DAYS = 90;
const norm = e => String(e || "").trim().toLowerCase();
const validEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 200;
const h = s => crypto.createHmac("sha256", config.appSecret).update(s).digest("hex");
const sign = v => crypto.createHmac("sha256", config.appSecret).update("client:" + v).digest("base64url");
const eq = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };

// App-store reviewers can't receive our emails, so a fixed demo login can be set on the host.
const review = () => ({ email: norm(process.env.REVIEW_EMAIL), code: String(process.env.REVIEW_CODE || "").trim() });

function paidPlans(email) {
  return db.prepare("SELECT token, pkg, paid_at, flagged, intake, lang, features FROM orders WHERE lower(email)=? AND kind='plan' AND status='paid' ORDER BY paid_at DESC").all(email)
    .map(o => {
      const i = JSON.parse(o.intake || "{}");
      return { token: o.token, pkg: o.pkg, pkgName: E.PKGNAME[o.pkg] || o.pkg, paidAt: o.paid_at, flagged: !!o.flagged, lang: i.lang || o.lang || "en",
        goal: i.goal, days: i.days, features: JSON.parse(o.features || "[]") };
    });
}

/** Sends a sign-in code. Always answers the same way so nobody can check which emails are clients. */
async function requestCode(rawEmail, lang) {
  const email = norm(rawEmail);
  if (!validEmail(email)) return { error: "Enter a valid email address." };
  const r = review();
  if (r.email && r.code && email === r.email) return { ok: true };
  const ar = lang === "ar";
  if (!paidPlans(email).length) {
    await mail.send(email, ar ? "تسجيل الدخول في Repvo" : "Signing in to Repvo", mail.layout(ar ? "مفيش خطط بالإيميل ده" : "No plans for this email", ar
      ? `<p>حد طلب كود دخول لـ Repvo بالإيميل ده، بس مفيش خطط مدفوعة بيه. لو اشتريت بإيميل تاني، استخدمه هو.</p>`
      : `<p>Someone asked for a Repvo sign-in code for this email, but there are no paid plans on it. If you ordered with a different email, sign in with that one.</p>`, ar));
    return { ok: true };
  }
  const code = String(crypto.randomInt(0, 1e6)).padStart(6, "0");
  db.prepare("INSERT INTO login_codes(email,code_hash,expires,tries,created_at) VALUES(?,?,?,0,?) ON CONFLICT(email) DO UPDATE SET code_hash=excluded.code_hash, expires=excluded.expires, tries=0, created_at=excluded.created_at")
    .run(email, h(email + ":" + code), Date.now() + CODE_MINUTES * 60e3, Date.now());
  await mail.send(email, ar ? `كود الدخول بتاعك في Repvo: ${code}` : `Your Repvo sign-in code: ${code}`, mail.layout(ar ? "كود الدخول" : "Your sign-in code", ar
    ? `<p>اكتب الكود ده في Repvo عشان تشوف خططك:</p><p style="font-size:32px;font-weight:800;letter-spacing:.2em;margin:12px 0">${code}</p><p style="color:#5B6570">الكود صالح ${CODE_MINUTES} دقيقة. لو مش انت اللي طلبته، تجاهل الإيميل ده.</p>`
    : `<p>Enter this code in Repvo to see your plans:</p><p style="font-size:32px;font-weight:800;letter-spacing:.2em;margin:12px 0">${code}</p><p style="color:#5B6570">It works for ${CODE_MINUTES} minutes. If you didn't ask for it, ignore this email.</p>`, ar));
  return { ok: true };
}

/** Checks the code; returns a session value for the cookie. */
function verifyCode(rawEmail, rawCode) {
  const email = norm(rawEmail), code = String(rawCode || "").replace(/\D/g, "");
  const bad = { error: "That code is wrong or has expired. Ask for a new one." };
  if (!validEmail(email) || code.length !== 6) return bad;
  const r = review();
  let ok = false;
  if (r.email && r.code && email === r.email) ok = eq(code, r.code.replace(/\D/g, "").padStart(6, "0"));
  else {
    const row = db.prepare("SELECT * FROM login_codes WHERE email=?").get(email);
    if (!row || row.expires < Date.now() || row.tries >= MAX_TRIES) return bad;
    ok = eq(h(email + ":" + code), row.code_hash);
    if (ok) db.prepare("DELETE FROM login_codes WHERE email=?").run(email);
    else db.prepare("UPDATE login_codes SET tries=tries+1 WHERE email=?").run(email);
  }
  if (!ok) return bad;
  const v = `${Buffer.from(email).toString("base64url")}.${Date.now() + SESSION_DAYS * 86400e3}`;
  logEvent(null, "client_login", { email });
  return { ok: true, session: `${v}.${sign(v)}`, maxAge: SESSION_DAYS * 86400 };
}

/** Email of the signed-in client, or null. */
function sessionEmail(cookieHeader) {
  const m = (cookieHeader || "").match(/(?:^|;\s*)rv_client=([^;]+)/);
  if (!m) return null;
  const p = m[1].split(".");
  if (p.length !== 3) return null;
  const v = p[0] + "." + p[1];
  if (!eq(sign(v), p[2]) || Number(p[1]) < Date.now()) return null;
  try { return Buffer.from(p[0], "base64url").toString("utf8"); } catch { return null; }
}

function me(email) {
  const sub = db.prepare("SELECT s.status, s.next_charge_at FROM subscriptions s JOIN orders o ON o.id=s.order_id WHERE lower(o.email)=? ORDER BY s.created_at DESC").get(email);
  const name = (db.prepare("SELECT name FROM orders WHERE lower(email)=? AND status='paid' ORDER BY paid_at DESC").get(email) || {}).name || "";
  return { email, name, plans: paidPlans(email), follow: sub || null };
}

/** Deletes the client's personal data. Payment records stay (amounts and dates only) for the accounts. */
async function deleteAccount(email, cancelStripe) {
  const orders = db.prepare("SELECT id FROM orders WHERE lower(email)=?").all(email);
  if (!orders.length) return { ok: true, orders: 0 };
  const ids = orders.map(o => o.id);
  const q = "(" + ids.map(() => "?").join(",") + ")";
  for (const s of db.prepare(`SELECT * FROM subscriptions WHERE order_id IN ${q} AND status!='cancelled'`).all(...ids)) {
    if (s.provider === "stripe" && s.provider_sub_id && cancelStripe) { try { await cancelStripe(s.provider_sub_id); } catch (e) { console.error("[delete] stripe cancel", e.message); } }
    db.prepare("UPDATE subscriptions SET status='cancelled' WHERE id=?").run(s.id);
  }
  db.exec("BEGIN");
  try {
    db.prepare(`UPDATE bookings SET status='cancelled', note='account deleted' WHERE order_id IN ${q} AND status IN ('held','confirmed') AND ts > ?`).run(...ids, Date.now());
    db.prepare(`DELETE FROM train_logs WHERE order_id IN ${q}`).run(...ids);
    db.prepare(`DELETE FROM food_logs WHERE order_id IN ${q}`).run(...ids);
    const upd = db.prepare("UPDATE orders SET name='Deleted client', email=NULL, phone=NULL, wa=NULL, intake=NULL, excluded=NULL, plan_foods=NULL, picks=NULL, flags=NULL, token=? WHERE id=?");
    ids.forEach(id => upd.run("deleted-" + crypto.randomBytes(18).toString("base64url"), id));
    db.prepare("DELETE FROM outbox WHERE lower(to_addr)=?").run(email);
    db.prepare("DELETE FROM login_codes WHERE email=?").run(email);
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
  ids.forEach(id => logEvent(id, "account_deleted"));
  if (config.mail.coachEmail) await mail.send(config.mail.coachEmail, "A client deleted their account", mail.layout("Account deleted", `<p>A client deleted their Repvo account. Their personal details, plans and logs were removed; payment amounts and dates were kept for your records (${ids.length} order${ids.length > 1 ? "s" : ""}). Any follow-up was stopped.</p>`));
  return { ok: true, orders: ids.length };
}

module.exports = { requestCode, verifyCode, sessionEmail, me, deleteAccount, norm };
