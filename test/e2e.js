// End-to-end test: runs the real server against a throwaway database.
// Usage: npm test
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fitplan-test-"));
Object.assign(process.env, {
  DB_PATH: path.join(dir, "t.db"), PORT: "0", PAYMENT_PROVIDER: "mock", ADMIN_PASSWORD: "test-pass",
  COACH_EMAIL: "coach@example.com", CHECKOUT_RATE_LIMIT: "1000", LOGIN_RATE_LIMIT: "1000", REVIEW_EMAIL: "review@repvo.test", REVIEW_CODE: "246810", PAYMOB_HMAC_SECRET: "hmac-test-secret", STRIPE_WEBHOOK_SECRET: "whsec_test", RESEND_API_KEY: "",
});
process.env.BASE_URL = "http://localhost"; // replaced below once we know the port

const { server } = require("../server");
const { db } = require("../lib/db");
const O = require("../lib/orders");

let base, cookie = "";
const results = [];
async function step(name, fn) {
  try { await fn(); results.push(["ok", name]); console.log("  ✓", name); }
  catch (e) { results.push(["FAIL", name, e]); console.log("  ✗", name, "\n   ", e.message); }
}
async function call(method, url, body, headers = {}) {
  const r = await fetch(base + url, { method, redirect: "manual", headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text, headers: r.headers };
}
const intake = (x = {}) => ({ region: "eg", pkg: "both", goal: "loss", sex: "f", age: 29, wt: 68, ht: 165, act: 1.55, bf: 30, bmr: null, days: 4, lvl: "int", eq: 0, meals: 4, flags: [], ...x });
const contact = { name: "Mona Kamal", email: "mona@example.com", phone: "+20 100 123 4567", wa: "+20 100 123 4567" };
const tokenOf = url => url.split("/").pop();

(async () => {
  await new Promise(r => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
  require("../lib/config").baseUrl = base;
  console.log("Repvo end-to-end test on", base);

  await step("public config, foods and slots load", async () => {
    const c = await call("GET", "/api/config"); assert.equal(c.json.prices.both, 8);
    const eg = await call("GET", "/api/foods?region=eg"); assert.ok(eg.json.some(f => f.name === "Ful medames")); assert.ok(!eg.json.some(f => f.name === "Tofu, firm"));
    assert.ok(eg.json.length > 80, "big food list"); assert.ok(!eg.json.some(f => f.name.startsWith("Koshari")), "tracker-only foods stay out of plans");
    assert.ok(!("kcal" in eg.json[0]), "macros should not be public");
    const intl = await call("GET", "/api/foods?region=intl"); assert.ok(intl.json.some(f => f.name === "Tofu, firm"));
    const s = await call("GET", "/api/slots"); assert.ok(s.json.length > 20);
    const fridays = s.json.filter(x => new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Cairo", weekday: "short" }).format(new Date(x.ts)) === "Fri");
    assert.equal(fridays.length, 0, "no Friday slots");
  });

  await step("pages are served with security headers", async () => {
    for (const p of ["/", "/admin", "/terms", "/plan/abc", "/assets/site.js", "/assets/style.css"]) { const r = await call("GET", p); assert.equal(r.status, 200, p); }
    const r = await call("GET", "/"); assert.match(r.headers.get("content-security-policy"), /frame-ancestors 'none'/);
    assert.equal((await call("GET", "/assets/../server.js")).status, 404);
    assert.equal((await call("GET", "/assets/%2e%2e/server.js")).status, 404);
  });

  await step("checkout validation rejects bad input", async () => {
    let r = await call("POST", "/api/checkout", { intake: intake(), contact: { ...contact, email: "nope" } }); assert.equal(r.status, 400); assert.match(r.json.error, /email/);
    r = await call("POST", "/api/checkout", { intake: intake({ wt: 5 }), contact }); assert.equal(r.status, 400); assert.match(r.json.error, /Weight/);
    const prot = (await call("GET", "/api/foods?region=eg")).json.filter(f => f.cat === "protein").map(f => f.id);
    r = await call("POST", "/api/checkout", { intake: intake(), contact, excluded: prot }); assert.equal(r.status, 400); assert.match(r.json.error, /protein/);
    r = await call("POST", "/api/checkout", { intake: intake(), contact, addons: { call: true } }); assert.equal(r.status, 400); assert.match(r.json.error, /call time/);
  });

  let normal;
  await step("normal order: pay, plan unlocks, server-side price, excluded food respected", async () => {
    const ex = (await call("GET", "/api/foods?region=eg")).json.find(f => f.name === "Ful medames").id;
    const r = await call("POST", "/api/checkout", { intake: intake(), contact, excluded: [ex], addons: {}, tz: "Africa/Cairo", total: 0.01 });
    assert.equal(r.status, 200, r.text); normal = tokenOf(r.json.url);
    let o = (await call("GET", "/api/order/" + normal)).json;
    assert.equal(o.status, "pending"); assert.equal(o.total, 8); assert.equal(o.plan, undefined, "no plan before payment");
    const p = await call("POST", "/api/mock/" + normal, { result: "pay" }); assert.equal(p.json.next, "/plan/" + normal);
    o = (await call("GET", "/api/order/" + normal)).json;
    assert.equal(o.status, "paid"); assert.ok(o.plan.meals.length === 4 && o.plan.training.length === 4);
    assert.equal(o.plan.targets.kcal, 1732);
    const names = o.plan.meals.flatMap(m => m.items.map(i => i.name));
    assert.ok(!names.includes("Ful medames"), "excluded food must not appear");
    const err = Math.abs(o.plan.day.k - o.plan.targets.kcal) / o.plan.targets.kcal; assert.ok(err < 0.06, "daily calories within 6%: " + err);
  });

  await step("paying twice is idempotent, swap changes a food", async () => {
    await call("POST", "/api/mock/" + normal, { result: "pay" });
    assert.equal(db.prepare("SELECT COUNT(*) n FROM events WHERE type='paid'").get().n, 1);
    const before = (await call("GET", "/api/order/" + normal)).json.plan.meals[1].items.find(i => i.role === "protein").name;
    const s = await call("POST", `/api/order/${normal}/swap`, { meal: 1, role: "protein" });
    assert.notEqual(s.json.plan.meals[1].items.find(i => i.role === "protein").name, before);
  });

  await step("emails go to client and coach", async () => {
    const m = db.prepare("SELECT to_addr, subject FROM outbox ORDER BY id").all();
    assert.ok(m.some(x => x.to_addr === "mona@example.com" && /ready/.test(x.subject)));
    assert.ok(m.some(x => x.to_addr === "coach@example.com" && /New order/.test(x.subject)));
  });

  let flaggedTok, slotTs;
  await step("flagged client: no auto plan, call required and booked", async () => {
    slotTs = (await call("GET", "/api/slots")).json.find(s => !s.taken).ts;
    const r = await call("POST", "/api/checkout", { intake: intake({ flags: ["heart"] }), contact: { ...contact, email: "heart@example.com" }, slot: slotTs, tz: "Europe/London" });
    assert.equal(r.status, 200, r.text); flaggedTok = tokenOf(r.json.url);
    let o = (await call("GET", "/api/order/" + flaggedTok)).json;
    assert.equal(o.total, 19); assert.deepEqual(o.lines.map(l => l.key), ["call"]);
    // slot is held while paying
    assert.ok((await call("GET", "/api/slots")).json.find(s => s.ts === slotTs).taken);
    await call("POST", "/api/mock/" + flaggedTok, { result: "pay" });
    o = (await call("GET", "/api/order/" + flaggedTok)).json;
    assert.equal(o.status, "paid"); assert.equal(o.plan, undefined); assert.equal(o.call.status, "confirmed");
    const coach = db.prepare("SELECT subject FROM outbox WHERE to_addr='coach@example.com' ORDER BY id DESC").get();
    assert.match(coach.subject, /Coach review/);
  });

  await step("under-18 is treated as coach review", async () => {
    const s = (await call("GET", "/api/slots")).json.find(x => !x.taken).ts;
    const r = await call("POST", "/api/checkout", { intake: intake({ age: 16 }), contact, slot: s });
    assert.equal(r.status, 200); const o = (await call("GET", "/api/order/" + tokenOf(r.json.url))).json;
    assert.equal(o.flagged, true); assert.ok(o.flags.includes("Client is under 18"));
  });

  await step("a booked slot can't be taken twice", async () => {
    const r = await call("POST", "/api/checkout", { intake: intake(), contact, addons: { call: true }, slot: slotTs });
    assert.equal(r.status, 400); assert.equal(r.json.slotTaken, true);
  });

  let subId;
  await step("follow-up: subscription starts, renewal link on the due date, renewal payment extends it", async () => {
    const r = await call("POST", "/api/checkout", { intake: intake({ pkg: "workout" }), contact: { ...contact, email: "follow@example.com" }, addons: { follow: true } });
    const tok = tokenOf(r.json.url);
    assert.equal((await call("GET", "/api/order/" + tok)).json.total, 55, "workout $5 + follow-up $50");
    await call("POST", "/api/mock/" + tok, { result: "pay" });
    const s = db.prepare("SELECT * FROM subscriptions WHERE email='follow@example.com'").get(); subId = s.id;
    assert.equal(s.status, "active"); assert.ok(s.next_charge_at > Date.now() + 27 * 86400e3);
    db.prepare("UPDATE subscriptions SET next_charge_at=? WHERE id=?").run(Date.now() - 1000, s.id);
    await O.tick();
    const s2 = db.prepare("SELECT * FROM subscriptions WHERE id=?").get(s.id); assert.ok(s2.pending_order_id);
    const mail = db.prepare("SELECT html FROM outbox WHERE to_addr='follow@example.com' AND subject LIKE 'Renew%'").get(); assert.ok(mail);
    const ren = db.prepare("SELECT token FROM orders WHERE id=?").get(s2.pending_order_id).token;
    assert.ok(mail.html.includes("/pay/" + ren));
    const pl = await call("GET", "/pay/" + ren); assert.equal(pl.status, 302); assert.match(pl.headers.get("location"), /\/pay\/mock\//);
    await O.tick(); // running again must not create a second renewal
    assert.equal(db.prepare("SELECT COUNT(*) n FROM orders WHERE sub_id=?").get(s.id).n, 1);
    await call("POST", "/api/mock/" + ren, { result: "pay" });
    const s3 = db.prepare("SELECT * FROM subscriptions WHERE id=?").get(s.id);
    assert.equal(s3.pending_order_id, null); assert.ok(s3.next_charge_at > Date.now() + 25 * 86400e3);
  });

  await step("unpaid renewal becomes past due after 7 days", async () => {
    db.prepare("UPDATE subscriptions SET next_charge_at=? WHERE id=?").run(Date.now() - 1000, subId);
    await O.tick();
    db.prepare("UPDATE subscriptions SET next_charge_at=? WHERE id=?").run(Date.now() - 8 * 86400e3, subId);
    await O.tick();
    assert.equal(db.prepare("SELECT status FROM subscriptions WHERE id=?").get(subId).status, "past_due");
  });

  await step("Paymob webhook: valid HMAC marks paid, bad HMAC rejected", async () => {
    const r = await call("POST", "/api/checkout", { intake: intake({ pkg: "nutrition" }), contact });
    const tok = tokenOf(r.json.url);
    const id = db.prepare("SELECT id FROM orders WHERE token=?").get(tok).id;
    const obj = { id: 987654, pending: false, amount_cents: 500, success: true, is_auth: false, is_capture: false, is_standalone_payment: true, is_voided: false, is_refunded: false, is_3d_secure: true, integration_id: 4567, has_parent_transaction: false, owner: 123, created_at: "2026-10-22T10:00:00.000000", currency: "USD", error_occured: false, order: { id: 1111, merchant_order_id: id + "-lz9abc" }, source_data: { pan: "2346", sub_type: "MasterCard", type: "card" } };
    const keys = ["amount_cents","created_at","currency","error_occured","has_parent_transaction","obj.id","integration_id","is_3d_secure","is_auth","is_capture","is_refunded","is_standalone_payment","is_voided","order.id","owner","pending","source_data.pan","source_data.sub_type","source_data.type","success"];
    const get = k => k === "obj.id" ? obj.id : k.split(".").reduce((a, x) => a[x], obj);
    const hmac = crypto.createHmac("sha512", "hmac-test-secret").update(keys.map(k => String(get(k))).join("")).digest("hex");
    const bad = await call("POST", "/webhooks/paymob?hmac=" + "0".repeat(128), { type: "TRANSACTION", obj }); assert.equal(bad.status, 401);
    assert.equal((await call("GET", "/api/order/" + tok)).json.status, "pending");
    const ok = await call("POST", "/webhooks/paymob?hmac=" + hmac, { type: "TRANSACTION", obj }); assert.equal(ok.status, 200);
    assert.equal((await call("GET", "/api/order/" + tok)).json.status, "paid");
    // return redirect with GET params
    const q = { amount_cents: 500, created_at: obj.created_at, currency: "USD", error_occured: "false", has_parent_transaction: "false", id: 987654, integration_id: 4567, is_3d_secure: "true", is_auth: "false", is_capture: "false", is_refunded: "false", is_standalone_payment: "true", is_voided: "false", order: 1111, owner: 123, pending: "false", "source_data.pan": "2346", "source_data.sub_type": "MasterCard", "source_data.type": "card", success: "true", merchant_order_id: id + "-lz9abc" };
    const qmap = k => k === "obj.id" ? q.id : k === "order.id" ? q.order : q[k];
    q.hmac = crypto.createHmac("sha512", "hmac-test-secret").update(keys.map(k => String(qmap(k))).join("")).digest("hex");
    const ret = await call("GET", "/return/paymob?" + new URLSearchParams(q));
    assert.equal(ret.status, 302); assert.equal(ret.headers.get("location"), "/plan/" + tok);
  });

  await step("Stripe webhook: valid signature marks paid, bad signature rejected", async () => {
    const r = await call("POST", "/api/checkout", { intake: intake({ pkg: "workout" }), contact });
    const tok = tokenOf(r.json.url);
    const id = db.prepare("SELECT id FROM orders WHERE token=?").get(tok).id;
    const payload = JSON.stringify({ type: "checkout.session.completed", data: { object: { id: "cs_test_1", payment_status: "paid", metadata: { order_id: id }, client_reference_id: id } } });
    const t = Math.floor(Date.now() / 1000);
    const sig = crypto.createHmac("sha256", "whsec_test").update(`${t}.${payload}`).digest("hex");
    assert.equal((await call("POST", "/webhooks/stripe", payload, { "Stripe-Signature": `t=${t},v1=${"a".repeat(64)}` })).status, 400);
    assert.equal((await call("POST", "/webhooks/stripe", payload, { "Stripe-Signature": `t=${t},v1=${sig}` })).status, 200);
    assert.equal((await call("GET", "/api/order/" + tok)).json.status, "paid");
  });

  await step("cancelled payment keeps order pending and retry link works", async () => {
    const r = await call("POST", "/api/checkout", { intake: intake({ pkg: "workout" }), contact });
    const tok = tokenOf(r.json.url);
    const c = await call("POST", "/api/mock/" + tok, { result: "cancel" }); assert.match(c.json.next, /cancelled=1/);
    assert.equal((await call("GET", "/api/order/" + tok)).json.status, "pending");
    const retry = await call("GET", "/pay/" + tok); assert.equal(retry.status, 302);
  });

  await step("old unpaid orders expire and release their call slot", async () => {
    const s = (await call("GET", "/api/slots")).json.find(x => !x.taken).ts;
    const r = await call("POST", "/api/checkout", { intake: intake(), contact, addons: { call: true }, slot: s });
    const id = db.prepare("SELECT id FROM orders WHERE token=?").get(tokenOf(r.json.url)).id;
    db.prepare("UPDATE orders SET created_at=? WHERE id=?").run(Date.now() - 4 * 3600e3, id);
    db.prepare("UPDATE bookings SET hold_until=? WHERE order_id=?").run(Date.now() - 1000, id);
    await O.tick();
    assert.equal(db.prepare("SELECT status FROM orders WHERE id=?").get(id).status, "expired");
    assert.equal((await call("GET", "/api/slots")).json.find(x => x.ts === s).taken, false);
  });

  await step("admin: locked without login, wrong password rejected", async () => {
    assert.equal((await call("GET", "/api/admin/orders")).status, 401);
    assert.equal((await call("POST", "/api/admin/login", { password: "nope" })).status, 401);
    const forged = await fetch(base + "/api/admin/orders", { headers: { Cookie: "fp_admin=admin.99999999999999.forged" } });
    assert.equal(forged.status, 401);
  });

  await step("admin: login, overview, orders, order detail", async () => {
    const l = await call("POST", "/api/admin/login", { password: "test-pass" });
    assert.equal(l.status, 200); cookie = l.headers.get("set-cookie").split(";")[0];
    const ov = (await call("GET", "/api/admin/overview")).json; assert.ok(ov.revenue30 > 0); assert.ok(ov.activeFollow >= 0);
    const list = (await call("GET", "/api/admin/orders?status=paid")).json; assert.ok(list.length >= 4);
    const found = (await call("GET", "/api/admin/orders?status=all&q=heart@")).json; assert.equal(found.length, 1);
    const d = (await call("GET", "/api/admin/orders/" + found[0].id)).json; assert.ok(d.events.length >= 2); assert.ok(d.intake.flags.includes("heart"));
  });

  await step("admin: price change shows on the site and is charged", async () => {
    const st = (await call("GET", "/api/admin/settings")).json;
    assert.equal((await call("PUT", "/api/admin/settings", { prices: { ...st.prices, both: 9.5 } })).status, 200);
    assert.equal((await call("GET", "/api/config")).json.prices.both, 9.5);
    const r = await call("POST", "/api/checkout", { intake: intake(), contact });
    assert.equal((await call("GET", "/api/order/" + tokenOf(r.json.url))).json.total, 9.5);
    assert.equal((await call("PUT", "/api/admin/settings", { prices: { ...st.prices, both: -1 } })).status, 400);
  });

  await step("admin: call hours change the calendar", async () => {
    const st = (await call("GET", "/api/admin/settings")).json;
    await call("PUT", "/api/admin/settings", { availability: { ...st.availability, startHour: 12, endHour: 13, days: [1] } });
    const s = (await call("GET", "/api/slots")).json;
    assert.ok(s.length >= 2 && s.every(x => ["12", "13"].includes(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", hourCycle: "h23" }).format(new Date(x.ts)))));
    await call("PUT", "/api/admin/settings", { availability: st.availability });
  });

  await step("admin: food edits apply to new plans, sold plans keep their foods", async () => {
    const foods = (await call("GET", "/api/admin/foods")).json;
    const kept = (await call("GET", "/api/order/" + normal)).json.plan.meals.flatMap(m => m.items.map(i => i.name));
    const next = foods.filter(f => f.name !== "Lean beef, cooked").concat([{ name: "Turkey breast", cat: "protein", kcal: 135, p: 30, c: 0, f: 1.5, slots: "LD", reg: "all" }]);
    const r = await call("PUT", "/api/admin/foods", { foods: next }); assert.equal(r.status, 200);
    assert.ok((await call("GET", "/api/foods?region=intl")).json.some(f => f.name === "Turkey breast"));
    const after = (await call("GET", "/api/order/" + normal)).json.plan.meals.flatMap(m => m.items.map(i => i.name));
    assert.deepEqual(after, kept);
    assert.equal((await call("PUT", "/api/admin/foods", { foods: [{ name: "x", cat: "candy" }] })).status, 400);
    await call("POST", "/api/admin/foods/reset");
  });

  await step("admin: reschedule and complete a call, stop a follow-up", async () => {
    const b = (await call("GET", "/api/admin/bookings")).json.find(x => x.status === "confirmed");
    const free = (await call("GET", "/api/slots")).json.find(x => !x.taken).ts;
    assert.equal((await call("PATCH", "/api/admin/bookings/" + b.id, { ts: free })).status, 200);
    assert.ok((await call("GET", "/api/slots")).json.find(x => x.ts === free).taken);
    await call("PATCH", "/api/admin/bookings/" + b.id, { status: "done" });
    assert.equal(db.prepare("SELECT status FROM bookings WHERE id=?").get(b.id).status, "done");
    assert.equal((await call("POST", `/api/admin/subscriptions/${subId}/cancel`)).status, 200);
    assert.equal(db.prepare("SELECT status FROM subscriptions WHERE id=?").get(subId).status, "cancelled");
  });

  await step("admin: manual mark-paid for a transfer", async () => {
    const r = await call("POST", "/api/checkout", { intake: intake({ pkg: "nutrition" }), contact });
    const id = db.prepare("SELECT id FROM orders WHERE token=?").get(tokenOf(r.json.url)).id;
    await call("POST", `/api/admin/orders/${id}/mark-paid`);
    assert.equal(db.prepare("SELECT status FROM orders WHERE id=?").get(id).status, "paid");
  });

  let addTok;
  await step("add-ons at checkout: priced on the server, only for matching packages", async () => {
    cookie = "";
    let r = await call("POST", "/api/checkout", { intake: intake({ pkg: "workout" }), contact, addons: { train_log: true, food_log: true, recipes: true, videos: true } });
    let o = (await call("GET", "/api/order/" + tokenOf(r.json.url))).json;
    assert.deepEqual(o.lines.map(l => l.key), ["pkg", "train_log"], "workout gets only the training tracker (videos are off until enabled)");
    assert.equal(o.total, 8);
    r = await call("POST", "/api/checkout", { intake: intake({ pkg: "both" }), contact, addons: { train_log: true, food_log: true, recipes: true } });
    addTok = tokenOf(r.json.url);
    o = (await call("GET", "/api/order/" + addTok)).json;
    const pr = (await call("GET", "/api/config")).json.prices;
    assert.equal(o.total, pr.both + pr.train_log + pr.food_log + pr.recipes);
    await call("POST", "/api/mock/" + addTok, { result: "pay" });
    o = (await call("GET", "/api/order/" + addTok)).json;
    assert.deepEqual(o.features.sort(), ["food_log", "recipes", "train_log"]);
    assert.ok(o.plan.meals.every(m => m.recipe && m.recipe.steps.length >= 3), "every meal has a recipe");
    assert.ok(!o.plan.training[0].rows[0].cues, "no video cues without the video add-on");
    assert.deepEqual(o.upgrades.map(u => u.key), ["supplements", "cardio", "follow", "call"], "supplements, cardio, follow-up and a call left to buy (videos off)");
  });

  await step("buying videos later as an upgrade unlocks cues and the player", async () => {
    const l = await call("POST", "/api/admin/login", { password: "test-pass" }); cookie = l.headers.get("set-cookie").split(";")[0];
    let r = await call("PUT", "/api/admin/videos", { offer: true, urls: { "Barbell bench press": "not a link" } });
    assert.equal(r.status, 400);
    // a list saved before new exercises existed: the missing ones get their default link
    r = await call("PUT", "/api/admin/videos", { offer: true, urls: { "Barbell bench press": "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "Seated cable row": "" } });
    assert.equal(r.status, 200);
    const vids = (await call("GET", "/api/admin/videos")).json;
    assert.ok(vids.exercises.length >= 100);
    assert.deepEqual(vids.exercises.filter(x => !x.ok).map(x => x.ex), ["Seated cable row"], "every exercise has a link except the one the coach cleared");
    assert.ok(vids.exercises.find(x => x.ex === "Barbell hip thrust").url.includes("youtube.com"));
    cookie = "";
    assert.equal((await call("GET", "/api/config")).json.videosOn, true);
    let o = (await call("GET", "/api/order/" + addTok)).json;
    assert.deepEqual(o.upgrades.map(u => u.key), ["videos", "supplements", "cardio", "follow", "call"]); assert.equal(o.upgrades[0].usd, 10);
    r = await call("POST", `/api/order/${addTok}/addon`, { feature: "videos" });
    assert.equal(r.status, 200, r.text);
    const p = await call("POST", "/api/mock/" + tokenOf(r.json.url), { result: "pay" });
    assert.equal(p.json.next, "/plan/" + addTok, "add-on payment lands back on the plan");
    o = (await call("GET", "/api/order/" + addTok)).json;
    assert.ok(o.features.includes("videos"));
    const bench = o.plan.training.flatMap(d => d.rows).find(x => x.ex === "Barbell bench press");
    assert.equal(bench.video.src, "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0"); assert.equal(bench.cues.length, 2);
    const rows = o.plan.training.flatMap(d => d.rows);
    const cleared = rows.find(x => x.ex === "Seated cable row");
    assert.equal(cleared.video, null); assert.ok(cleared.cues.length, "cleared link still shows form cues");
    assert.ok(rows.filter(x => x.ex !== "Seated cable row").every(x => x.video && x.video.src), "all other exercises have a video");
    assert.equal((await call("POST", `/api/order/${addTok}/addon`, { feature: "videos" })).status, 400, "can't buy twice");
    assert.ok(db.prepare("SELECT 1 FROM outbox WHERE subject='Added to your Repvo plan'").get());
  });

  await step("training tracker: save, history, progress data, delete, locked without the add-on", async () => {
    const t = (await call("GET", `/api/order/${addTok}/train`)).json;
    assert.equal(t.days.length, 4); assert.equal(t.sessions.length, 0);
    const d1 = t.days[0];
    let r = await call("POST", `/api/order/${addTok}/train`, { day: 1, date: "2026-10-20", entries: [{ ex: d1.rows[0].ex, sets: [{ kg: 40, reps: 8 }, { kg: 42.5, reps: 6 }] }, { ex: d1.rows[1].ex, sets: [{ kg: null, reps: 12 }] }] });
    assert.equal(r.status, 200, r.text);
    r = await call("POST", `/api/order/${addTok}/train`, { day: 1, date: "2026-10-22", entries: [{ ex: d1.rows[0].ex, sets: [{ kg: 45, reps: 6 }] }] });
    assert.equal((await call("POST", `/api/order/${addTok}/train`, { day: 1, date: "bad", entries: [] })).status, 400);
    const t2 = (await call("GET", `/api/order/${addTok}/train`)).json;
    assert.equal(t2.sessions.length, 2); assert.equal(t2.sessions[0].date, "2026-10-22");
    assert.equal((await call("DELETE", `/api/order/${addTok}/train/${t2.sessions[0].id}`)).status, 200);
    assert.equal((await call("GET", `/api/order/${addTok}/train`)).json.sessions.length, 1);
    assert.equal((await call("GET", `/api/order/${normal}/train`)).status, 404, "tracker needs the add-on");
  });

  await step("nutrition tracker: search foods, log by grams, planned meal and custom, totals", async () => {
    const foods = (await call("GET", `/api/order/${addTok}/foods`)).json;
    assert.ok(foods.some(f => f.name.startsWith("Koshari")), "tracker includes Egyptian dishes");
    const rice = foods.find(f => f.name === "White rice, cooked");
    assert.equal((await call("POST", `/api/order/${addTok}/food`, { date: "2026-10-22", foodId: rice.id, grams: 200 })).status, 200);
    assert.equal((await call("POST", `/api/order/${addTok}/food`, { date: "2026-10-22", meal: 0 })).status, 200);
    assert.equal((await call("POST", `/api/order/${addTok}/food`, { date: "2026-10-22", name: "Birthday cake", kcal: 350, c: 45 })).status, 200);
    assert.equal((await call("POST", `/api/order/${addTok}/food`, { date: "2026-10-22", foodId: rice.id, grams: 0 })).status, 400);
    const day = (await call("GET", `/api/order/${addTok}/food?date=2026-10-22`)).json;
    assert.ok(day.entries.length >= 4);
    assert.equal(day.entries[0].kcal, 260);
    const planned = day.entries.filter(e => e.meal === "Breakfast");
    assert.ok(planned.length >= 2, "planned meal logged item by item");
    assert.ok(day.targets.kcal > 1000 && day.meals.length === 4);
    assert.equal(day.history.length, 1);
    const cake = day.entries.find(e => e.name === "Birthday cake");
    assert.equal((await call("DELETE", `/api/order/${addTok}/food/${cake.id}`)).status, 200);
    assert.equal((await call("GET", `/api/order/${normal}/food?date=2026-10-22`)).status, 404);
  });

  await step("supplements guide: priced $5, personal doses, fish-free diets get omega-3", async () => {
    const r = await call("POST", "/api/checkout", { intake: intake({ wt: 80, goal: "gain", sex: "m" }), contact, addons: { supplements: true } });
    const tok = tokenOf(r.json.url);
    let o = (await call("GET", "/api/order/" + tok)).json;
    assert.equal(o.lines.find(l => l.key === "supplements").usd, 5);
    await call("POST", "/api/mock/" + tok, { result: "pay" });
    o = (await call("GET", "/api/order/" + tok)).json;
    const names = o.supplements.items.map(i => i.name);
    assert.ok(names.includes("Creatine monohydrate"));
    assert.ok(o.supplements.items.find(i => i.name.startsWith("Caffeine")).dose.includes("240 mg"), "3 mg/kg for 80 kg");
    assert.ok(o.supplements.skip.length >= 4 && o.supplements.notes.length >= 3);
    const salmon = (await call("GET", "/api/foods?region=eg")).json.filter(f => /Salmon|Sardines/.test(f.name)).map(f => f.id);
    const r2 = await call("POST", "/api/checkout", { intake: intake(), contact, excluded: salmon, addons: { supplements: true } });
    await call("POST", "/api/mock/" + tokenOf(r2.json.url), { result: "pay" });
    const o2 = (await call("GET", "/api/order/" + tokenOf(r2.json.url))).json;
    assert.ok(o2.supplements.items.some(i => i.name.startsWith("Omega-3")));
    assert.ok(o2.supplements.skip.some(x => x.startsWith("Iron")), "iron warning for women");
  });

  await step("training split follows the days chosen (2 to 6)", async () => {
    const want = { 2: ["Upper", "Lower"], 3: ["Push", "Pull", "Legs"], 4: ["Upper A", "Lower A", "Upper B", "Lower B"], 5: ["Chest", "Back", "Shoulders", "Legs", "Arms"], 6: ["Push", "Pull", "Legs", "Push", "Pull", "Legs"] };
    for (const d of [2, 3, 4, 5, 6]) for (const eq of [0, 1, 2]) {
      const r = await call("POST", "/api/checkout", { intake: intake({ pkg: "workout", days: d, eq }), contact });
      assert.equal(r.status, 200, r.text);
      const tok = tokenOf(r.json.url);
      await call("POST", "/api/mock/" + tok, { result: "pay" });
      const p = (await call("GET", "/api/order/" + tok)).json.plan;
      assert.deepEqual(p.training.map(x => x.name), want[d], `${d} days`);
      assert.ok(p.trainingInfo.split.length > 5);
      p.training.forEach(x => assert.equal(new Set(x.rows.map(r => r.ex)).size, x.rows.length, "no repeats inside a day"));
      if (d === 4) {
        const a = new Set([...p.training[0].rows, ...p.training[1].rows].map(r => r.ex));
        assert.ok([...p.training[2].rows, ...p.training[3].rows].every(r => !a.has(r.ex)), "B days use different exercises from A days");
      }
    }
    const bad = await call("POST", "/api/checkout", { intake: intake({ days: 7 }), contact });
    assert.equal(bad.status, 400);
    const r = await call("POST", "/api/checkout", { intake: intake({ days: 5, lang: "ar" }), contact });
    await call("POST", "/api/mock/" + tokenOf(r.json.url), { result: "pay" });
    const p = (await call("GET", "/api/order/" + tokenOf(r.json.url))).json.plan;
    assert.deepEqual(p.training.map(x => x.name), ["صدر", "ظهر", "أكتاف", "أرجل", "ذراعين"]);
    assert.ok(p.training.flatMap(x => x.rows).every(r => /[؀-ۿ]/.test(r.ex)), "new exercises have Arabic names");
  });

  await step("medical questions: injuries remove risky exercises, new red flags go to a coach", async () => {
    const { STRESS } = require("../lib/engine");
    for (const [inj, eq] of [[["knee"], 0], [["shoulder"], 2], [["lowback", "knee"], 1], [["wrist", "elbow"], 0]]) {
      const r = await call("POST", "/api/checkout", { intake: intake({ pkg: "workout", eq, injuries: [...inj, "bogus"], medNotes: "Asthma, uses an inhaler" }), contact });
      assert.equal(r.status, 200, r.text);
      const tok = tokenOf(r.json.url);
      await call("POST", "/api/mock/" + tok, { result: "pay" });
      const o = (await call("GET", "/api/order/" + tok)).json;
      assert.equal(o.flagged, false, "pain alone still gets an automatic plan");
      const rows = o.plan.training.flatMap(d => d.rows);
      assert.ok(rows.every(x => !(STRESS[x.key] || []).some(a => inj.includes(a))), `nothing loads the ${inj}`);
      assert.ok(o.plan.training.every(d => d.rows.length >= 4), "every day still has at least 4 exercises");
      assert.ok(o.plan.training.every(d => new Set(d.rows.map(x => x.key)).size === d.rows.length));
      assert.ok(o.plan.trainingInfo.adjust && o.plan.trainingInfo.adjust.areas.length === inj.length);
      const t = (await call("GET", `/api/order/${tok}/train`));
      if (t.status === 200) assert.ok(t.json.days[0].rows.every(x => !(STRESS[x.key] || []).some(a => inj.includes(a))));
    }
    const g = await call("POST", "/api/checkout", { intake: intake({ pkg: "workout", eq: 0, injuries: ["shoulder"] }), contact });
    await call("POST", "/api/mock/" + tokenOf(g.json.url), { result: "pay" });
    const gp = (await call("GET", "/api/order/" + tokenOf(g.json.url))).json.plan;
    assert.ok(gp.trainingInfo.adjust.swapped.some(([a, b]) => a === "Barbell bench press" && b === "Dumbbell floor press"), "bench press swapped for floor press");
    const none = await call("POST", "/api/checkout", { intake: intake({ pkg: "workout" }), contact });
    await call("POST", "/api/mock/" + tokenOf(none.json.url), { result: "pay" });
    assert.equal((await call("GET", "/api/order/" + tokenOf(none.json.url))).json.plan.trainingInfo.adjust, null);
    const d = await call("POST", "/api/checkout", { intake: intake({ flags: ["dizzy"] }), contact });
    assert.equal(d.status, 400, "a red flag needs a coach call");
    assert.ok(/call/i.test(d.text));
    const m = db.prepare("SELECT html FROM outbox WHERE to_addr='coach@example.com' AND html LIKE '%Asthma%'").get();
    assert.ok(m && m.html.includes("Pain / injury"), "coach email shows injuries and notes");
  });

  await step("cardio plan: $8 add-on, zones from age, built around lifting days, upgrade and Arabic", async () => {
    const r = await call("POST", "/api/checkout", { intake: intake({ age: 30, days: 4, goal: "loss" }), contact, addons: { cardio: true } });
    const tok = tokenOf(r.json.url);
    let o = (await call("GET", "/api/order/" + tok)).json;
    assert.equal(o.lines.find(l => l.key === "cardio").usd, 8);
    assert.equal(o.cardio, undefined, "nothing before payment");
    await call("POST", "/api/mock/" + tok, { result: "pay" });
    o = (await call("GET", "/api/order/" + tok)).json;
    const c = o.cardio;
    assert.equal(c.hrMax, 187);
    assert.equal(c.zones[0].bpm, "112–131");
    assert.equal(c.sessions.reduce((n, x) => n + x.perWeek, 0), 3); assert.equal(c.sessions[0].perWeek, 2); assert.equal(c.sessions[0].weeks.length, 4);
    assert.equal(c.week.length, 7); assert.equal(c.week.filter(w => w.lift).length, 4);
    const legs = new Set(["Lower A", "Lower B"]);
    c.week.forEach((w, i) => { if (/Intervals|Tempo/.test(w.cardio)) assert.ok(!legs.has(c.week[(i + 1) % 7].lift), "no hard cardio the day before legs"); });
    assert.ok(c.steps[3] > c.steps[0] && c.notes.length >= 4);
    // workout-only plans can buy it later from the plan page
    const w = await call("POST", "/api/checkout", { intake: intake({ pkg: "workout" }), contact });
    const wt = tokenOf(w.json.url);
    await call("POST", "/api/mock/" + wt, { result: "pay" });
    let wo = (await call("GET", "/api/order/" + wt)).json;
    assert.ok(wo.upgrades.some(u => u.key === "cardio" && u.usd === 8));
    const up = await call("POST", `/api/order/${wt}/addon`, { feature: "cardio" });
    assert.equal(up.status, 200, up.text);
    await call("POST", "/api/mock/" + tokenOf(up.json.url), { result: "pay" });
    wo = (await call("GET", "/api/order/" + wt)).json;
    assert.ok(wo.cardio && wo.cardio.week.length === 7);
    // Arabic
    const a = await call("POST", "/api/checkout", { intake: intake({ lang: "ar", days: 3 }), contact, addons: { cardio: true } });
    await call("POST", "/api/mock/" + tokenOf(a.json.url), { result: "pay" });
    const ac = (await call("GET", "/api/order/" + tokenOf(a.json.url))).json.cardio;
    assert.ok(/[؀-ۿ]/.test(ac.sessions[0].name) && ac.week.some(x => x.lift === "دفع"));
  });

  let arTok;
  await step("Arabic program: plan, recipes, exercises, supplements, trackers and email in Arabic", async () => {
    const r = await call("POST", "/api/checkout", { intake: intake({ lang: "ar" }), contact: { ...contact, email: "arabic@example.com" }, addons: { recipes: true, supplements: true, food_log: true, train_log: true } });
    arTok = tokenOf(r.json.url);
    await call("POST", "/api/mock/" + arTok, { result: "pay" });
    const o = (await call("GET", "/api/order/" + arTok)).json;
    assert.equal(o.lang, "ar"); assert.equal(o.plan.lang, "ar");
    assert.equal(o.plan.meals[0].name, "الفطار");
    assert.ok(o.plan.meals.flatMap(m => m.items).every(i => /[\u0600-\u06FF]/.test(i.name)), "all food names in Arabic");
    assert.ok(/[\u0600-\u06FF]/.test(o.plan.meals[0].recipe.title) && o.plan.meals[0].recipe.steps[0].includes("جم"));
    assert.ok(/[\u0600-\u06FF]/.test(o.plan.training[0].rows[0].ex)); assert.equal(o.plan.training[0].rows[0].key, "Barbell bench press");
    assert.equal(o.supplements.items[0].name, "كرياتين مونوهيدرات");
    const t = (await call("GET", `/api/order/${arTok}/train`)).json;
    assert.ok(/[\u0600-\u06FF]/.test(t.days[0].rows[0].ex) && t.days[0].rows[0].key === "Barbell bench press");
    const foods = (await call("GET", `/api/order/${arTok}/foods`)).json;
    assert.ok(foods.some(f => f.name === "كشري (تقريبي)"));
    await call("POST", `/api/order/${arTok}/food`, { date: "2026-10-22", meal: 0 });
    const day = (await call("GET", `/api/order/${arTok}/food?date=2026-10-22`)).json;
    assert.ok(day.entries.length && /[\u0600-\u06FF]/.test(day.entries[0].name));
    const m = db.prepare("SELECT subject, html FROM outbox WHERE to_addr='arabic@example.com'").get();
    assert.equal(m.subject, "خطتك من Repvo جاهزة"); assert.ok(m.html.includes('dir="rtl"'));
    const en = (await call("GET", "/api/order/" + normal)).json;
    assert.equal(en.plan.meals[0].name, "Breakfast", "English plans stay English");
  });

  await step("blog and team: public pages, admin editing, drafts hidden, safe formatting, sitemap", async () => {
    // a paying client, signed in to My plans, reads full articles
    const mem = "reader@example.com";
    const mr = await call("POST", "/api/checkout", { intake: intake({ pkg: "workout" }), contact: { ...contact, email: mem } });
    await call("POST", "/api/mock/" + tokenOf(mr.json.url), { result: "pay" });
    await call("POST", "/api/auth/code", { email: mem });
    const mcode = db.prepare("SELECT subject FROM outbox WHERE to_addr=? AND subject LIKE 'Your Repvo sign-in code%' ORDER BY id DESC").get(mem).subject.match(/(\d{6})/)[1];
    const mck = (await call("POST", "/api/auth/verify", { email: mem, code: mcode })).headers.get("set-cookie").split(";")[0];
    const list = await call("GET", "/blog");
    assert.equal(list.status, 200); assert.ok(list.text.includes("How Repvo calculates your calories"), "starter articles");
    assert.ok(/<link rel="canonical"/.test(list.text));
    assert.ok(list.text.includes("postcard featured") && list.text.includes('class="topics"') && list.text.includes('class="blogsearch"'));
    const tr = (await call("GET", "/blog?tag=train")).text;
    assert.ok(tr.includes("A 5-minute warm-up") && !tr.includes("Stuck on the scale"), "topic filter");
    const sr = (await call("GET", "/blog?q=shawarma")).text;
    assert.ok(sr.includes("Eating out without ruining your plan") && !sr.includes("Creatine: what it does"), "search reads article text");
    assert.ok((await call("GET", "/blog?q=%3Cscript%3E")).text.includes("&lt;script&gt;"), "search words are escaped");
    const sleep = (await call("GET", "/blog/sleep-and-muscle-growth")).text;
    const sleepM = (await call("GET", "/blog/sleep-and-muscle-growth", undefined, { Cookie: mck })).text;
    assert.ok(sleepM.includes('href="#how-much-is-enough"') && sleepM.includes('id="how-much-is-enough"') && sleepM.includes("Same wake-up time every day"), "clients get the linked contents and full text");
    assert.ok(sleep.includes('class="toc"') && sleep.includes('class="lockbox"'), "visitors get the opening and a lock box");
    assert.ok(!sleep.includes("Same wake-up time every day") && sleep.includes("Training is the signal"), "the rest of the article is not sent to visitors");
    assert.ok(list.text.includes('class="plock"'), "cards show a lock for visitors");
    const api = (await call("GET", "/api/blog?limit=3")).json;
    assert.equal(api.length, 3); assert.ok(!("body" in api[0]) && api[0].mins >= 1);
    const ar = (await call("GET", "/api/blog?lang=ar")).json; assert.ok(ar.length >= 1 && ar.every(x => x.lang === "ar"));
    const visitor = (await call("GET", "/blog/how-repvo-calculates-your-calories-and-macros")).text;
    assert.ok(visitor.includes('class="lockbox"') && !visitor.includes('class="postcta'), "visitor sees the lock, not the full article");
    const post = await call("GET", "/blog/how-repvo-calculates-your-calories-and-macros", undefined, { Cookie: mck });
    assert.ok(!post.text.includes('class="lockbox"'), "clients get the whole article");
    assert.equal(post.headers.get("cache-control"), "private, no-store");
    assert.ok(!(await call("GET", "/blog", undefined, { Cookie: mck })).text.includes('class="plock"'), "no locks for clients");
    assert.equal(post.status, 200); assert.ok(post.text.includes("Mifflin-St Jeor") && post.text.includes("<h2 id="));
    assert.ok(post.text.includes("wa.me/?text=") && post.text.includes("Keep reading"), "share links and related articles");
    assert.ok(post.text.includes('property="og:title"'));
    const arPost = await call("GET", "/blog/kam-yom-tetmarran"); assert.ok(arPost.text.includes('dir="rtl"'));
    assert.equal((await call("GET", "/blog/nope-not-here")).status, 404);
    assert.equal((await call("GET", "/api/admin/posts")).status, 401, "admin only");
    const l = await call("POST", "/api/admin/login", { password: "test-pass" }); cookie = l.headers.get("set-cookie").split(";")[0];
    const bad = await call("POST", "/api/admin/posts", { title: "" }); assert.equal(bad.status, 400);
    const c = await call("POST", "/api/admin/posts", { title: "Leg day <script>alert(1)</script>", lang: "en", excerpt: "x", body: "## Squat\n\n<img src=x onerror=alert(1)> **deep** [guide](javascript:alert(1)) [ok](https://example.com)", published: false });
    assert.equal(c.status, 200, c.text);
    const slug = c.json.post.slug;
    assert.equal((await call("GET", "/blog/" + slug)).status, 404, "drafts are not public");
    const dup = await call("POST", "/api/admin/posts", { title: "Other", slug, published: true }); assert.equal(dup.status, 400, "slugs are unique");
    assert.equal((await call("PUT", "/api/admin/posts/" + c.json.post.id, { ...c.json.post, published: true })).status, 200);
    const pub = await call("GET", "/blog/" + slug);
    assert.equal(pub.status, 200);
    assert.ok(!pub.text.includes("<script>alert") && !pub.text.includes("<img src=x") && !pub.text.includes('href="javascript'), "html and bad links are escaped");
    assert.ok(pub.text.includes("<b>deep</b>") && pub.text.includes('href="https://example.com"'));
    assert.ok((await call("GET", "/sitemap.xml")).text.includes("/blog/" + slug));
    assert.ok((await call("GET", "/robots.txt")).text.includes("Sitemap:"));
    assert.ok((await call("GET", "/blog/feed.xml")).text.includes("<rss"));
    assert.equal((await call("DELETE", "/api/admin/posts/" + c.json.post.id)).status, 200);
    assert.equal((await call("GET", "/blog/" + slug)).status, 404);
    // team
    const t0 = (await call("GET", "/api/team")).json; assert.deepEqual(t0, [], "nobody is listed until added in admin");
    const st = await call("PUT", "/api/admin/team", { members: [{ name: "Ahmed", role: "Founder", bio: "Coach", creds: "Certified personal trainer, Bodybuilder" }, { name: "", role: "ignored" }] });
    assert.equal(st.status, 200); assert.equal(st.json.members.length, 1); assert.deepEqual(st.json.members[0].creds, ["Certified personal trainer", "Bodybuilder"]);
    assert.equal((await call("GET", "/api/team")).json[0].role, "Founder");
    cookie = "";
    assert.equal((await call("GET", "/js/blog.js")).status, 200);
    const home = (await call("GET", "/")).text; assert.ok(home.includes('id="team"') && home.includes('id="blog"'));
  });

  await step("after buying: coach follow-up and a coach call from My plans", async () => {
    const em = "later.buyer@example.com";
    const r = await call("POST", "/api/checkout", { intake: intake({ pkg: "workout" }), contact: { ...contact, email: em, name: "Karim Later" } });
    const t = tokenOf(r.json.url); await call("POST", "/api/mock/" + t, { result: "pay" });
    await call("POST", "/api/auth/code", { email: em });
    const code = db.prepare("SELECT subject FROM outbox WHERE to_addr=? AND subject LIKE 'Your Repvo sign-in code%' ORDER BY id DESC").get(em).subject.match(/(\d{6})/)[1];
    const ck = (await call("POST", "/api/auth/verify", { email: em, code })).headers.get("set-cookie").split(";")[0];
    let me = (await call("GET", "/api/me", undefined, { Cookie: ck })).json;
    const keys = me.plans[0].upgrades.map(u => u.key);
    assert.ok(keys.includes("follow") && keys.includes("call") && keys.includes("cardio"), keys.join());
    assert.equal(me.plans[0].upgrades.find(u => u.key === "follow").recurring, true);
    const APPUA = { "User-Agent": "Mozilla/5.0 (iPhone) RepvoApp/1.0", Cookie: ck };
    assert.deepEqual((await call("GET", "/api/me", undefined, APPUA)).json.plans[0].upgrades, [], "the app sells nothing");
    assert.equal((await call("POST", `/api/order/${t}/addon`, { feature: "follow" }, APPUA)).status, 400);
    // follow-up
    let a = await call("POST", `/api/order/${t}/addon`, { feature: "follow" });
    assert.equal(a.status, 200, a.text);
    await call("POST", "/api/mock/" + tokenOf(a.json.url), { result: "pay" });
    let o = (await call("GET", "/api/order/" + t)).json;
    assert.equal(o.follow.status, "active", "follow-up now belongs to the plan");
    assert.ok(!o.upgrades.some(u => u.key === "follow"));
    assert.equal((await call("GET", `/api/order/${t}/weekly`)).json.active, true, "weekly calls open");
    assert.equal((await call("POST", `/api/order/${t}/addon`, { feature: "follow" })).status, 400, "no second follow-up");
    me = (await call("GET", "/api/me", undefined, { Cookie: ck })).json;
    assert.equal(me.follow.status, "active");
    // a single call needs a free time
    assert.equal((await call("POST", `/api/order/${t}/addon`, { feature: "call" })).status, 400);
    const slots = (await call("GET", "/api/slots")).json.filter(x => !x.taken);
    a = await call("POST", `/api/order/${t}/addon`, { feature: "call", slot: slots[3].ts });
    assert.equal(a.status, 200, a.text);
    assert.ok((await call("GET", "/api/slots")).json.find(x => x.ts === slots[3].ts).taken, "slot held while paying");
    await call("POST", "/api/mock/" + tokenOf(a.json.url), { result: "pay" });
    o = (await call("GET", "/api/order/" + t)).json;
    assert.equal(o.calls.length, 1); assert.equal(o.calls[0].ts, slots[3].ts); assert.equal(o.calls[0].status, "confirmed");
    assert.ok(o.upgrades.some(u => u.key === "call"), "more calls can be booked");
    assert.ok(db.prepare("SELECT 1 FROM outbox WHERE subject LIKE 'Coach call booked:%'").get() || !process.env.COACH_EMAIL);
  });

  await step("My plans: email code sign-in, plan list, app mode, review login, account deletion", async () => {
    const em = "account.owner@example.com";
    const r1 = await call("POST", "/api/checkout", { intake: intake(), contact: { ...contact, email: "Account.Owner@example.com", name: "Laila Hassan" }, addons: { cardio: true } });
    const t1 = tokenOf(r1.json.url); await call("POST", "/api/mock/" + t1, { result: "pay" });
    const r2 = await call("POST", "/api/checkout", { intake: intake({ pkg: "workout", lang: "ar" }), contact: { ...contact, email: em, name: "Laila Hassan" } });
    const t2 = tokenOf(r2.json.url); await call("POST", "/api/mock/" + t2, { result: "pay" });
    const pending = await call("POST", "/api/checkout", { intake: intake(), contact: { ...contact, email: em } }); // never paid
    assert.equal((await call("GET", "/api/me")).status, 401);
    assert.equal((await call("POST", "/api/auth/code", { email: "nope" })).status, 400);
    // unknown email: same answer, no code
    assert.equal((await call("POST", "/api/auth/code", { email: "stranger@example.com" })).status, 200);
    assert.ok(!db.prepare("SELECT 1 FROM login_codes WHERE email='stranger@example.com'").get());
    assert.equal((await call("POST", "/api/auth/code", { email: em })).status, 200);
    const mail = db.prepare("SELECT subject FROM outbox WHERE to_addr=? AND subject LIKE 'Your Repvo sign-in code%' ORDER BY id DESC").get(em);
    const code = mail.subject.match(/(\d{6})/)[1];
    const wrong = code === "000000" ? "111111" : "000000";
    assert.equal((await call("POST", "/api/auth/verify", { email: em, code: wrong })).status, 400);
    const ok = await call("POST", "/api/auth/verify", { email: em.toUpperCase(), code });
    assert.equal(ok.status, 200, ok.text);
    const ck = ok.headers.get("set-cookie").split(";")[0];
    assert.ok(/HttpOnly/.test(ok.headers.get("set-cookie")));
    assert.equal((await call("POST", "/api/auth/verify", { email: em, code })).status, 400, "a code works once");
    const me = (await call("GET", "/api/me", undefined, { Cookie: ck })).json;
    assert.equal(me.name, "Laila Hassan"); assert.equal(me.plans.length, 2, "only paid plans, case-insensitive email");
    assert.deepEqual(new Set(me.plans.map(p => p.token)), new Set([t1, t2]));
    assert.ok(me.plans.find(p => p.token === t1).features.includes("cardio"));
    assert.equal((await call("GET", "/api/me", undefined, { Cookie: ck.replace(/.$/, c => (c === "A" ? "B" : "A")) })).status, 401, "tampered cookie rejected");
    // too many wrong codes locks the code
    await call("POST", "/api/auth/code", { email: em });
    for (let i = 0; i < 5; i++) await call("POST", "/api/auth/verify", { email: em, code: "999999" });
    const fresh = db.prepare("SELECT subject FROM outbox WHERE to_addr=? AND subject LIKE 'Your Repvo sign-in code%' ORDER BY id DESC").get(em).subject.match(/(\d{6})/)[1];
    if (fresh !== "999999") assert.equal((await call("POST", "/api/auth/verify", { email: em, code: fresh })).status, 400, "locked after 5 wrong tries");
    // phone app: home goes to My plans, nothing for sale on the plan page
    const APPUA = { "User-Agent": "Mozilla/5.0 (iPhone) RepvoApp/1.0" };
    const home = await call("GET", "/", undefined, APPUA);
    assert.equal(home.status, 302); assert.equal(home.headers.get("location"), "/account");
    assert.equal((await call("GET", "/")).status, 200, "website home unchanged");
    const inApp = (await call("GET", "/api/order/" + t2, undefined, APPUA)).json;
    assert.deepEqual(inApp.upgrades, []); assert.equal(inApp.app, true);
    assert.ok((await call("GET", "/api/order/" + t2)).json.upgrades.length > 0, "website still offers add-ons");
    assert.equal((await call("GET", "/account")).status, 200);
    assert.equal((await call("GET", "/manifest.webmanifest")).status, 200);
    assert.equal((await call("GET", "/sw.js")).status, 200);
    // store reviewers: fixed demo login, no email needed
    assert.equal((await call("POST", "/api/auth/code", { email: "review@repvo.test" })).status, 200);
    assert.equal((await call("POST", "/api/auth/verify", { email: "review@repvo.test", code: "000000" })).status, 400);
    assert.equal((await call("POST", "/api/auth/verify", { email: "review@repvo.test", code: "246810" })).status, 200);
    // delete account
    assert.equal((await call("POST", "/api/me/delete", { confirm: "nope" }, { Cookie: ck })).status, 400);
    const del = await call("POST", "/api/me/delete", { confirm: "delete" }, { Cookie: ck });
    assert.equal(del.status, 200, del.text); assert.equal(del.json.orders, 3);
    assert.equal((await call("GET", "/api/order/" + t1)).status, 404, "old plan links stop working");
    assert.equal((await call("GET", "/api/me", undefined, { Cookie: ck })).json.plans.length, 0);
    const left = db.prepare("SELECT name, email, intake, total_usd, paid_at FROM orders WHERE id=(SELECT order_id FROM events WHERE type='account_deleted' ORDER BY id DESC LIMIT 1)").get();
    assert.equal(left.email, null); assert.equal(left.intake, null); assert.equal(left.name, "Deleted client");
    assert.ok(!db.prepare("SELECT 1 FROM outbox WHERE lower(to_addr)=?").get(em), "their emails are removed");
    assert.ok(db.prepare("SELECT 1 FROM outbox WHERE subject='A client deleted their account'").get());
  });

  await step("coach follow-up: $50/month, one call per week, booking rules and cancel", async () => {
    const r = await call("POST", "/api/checkout", { intake: intake(), contact: { ...contact, email: "weekly@example.com" }, addons: { follow: true } });
    assert.equal(r.status, 200, r.text);
    const tok = tokenOf(r.json.url);
    let o = (await call("GET", "/api/order/" + tok)).json;
    assert.equal(o.lines.find(l => l.key === "follow").usd, 50);
    assert.equal((await call("GET", `/api/order/${tok}/weekly`)).status, 404, "nothing before payment");
    await call("POST", "/api/mock/" + tok, { result: "pay" });
    let w = (await call("GET", `/api/order/${tok}/weekly`)).json;
    assert.equal(w.active, true); assert.ok(w.slots.length > 10); assert.equal(w.booked.length, 0);
    const free = w.slots.filter(x => !x.taken && !x.weekUsed);
    const first = free[0];
    assert.equal((await call("POST", `/api/order/${tok}/weekly`, { slot: first.ts })).status, 200);
    w = (await call("GET", `/api/order/${tok}/weekly`)).json;
    assert.equal(w.booked.length, 1);
    const sameWeek = w.slots.find(x => !x.taken && x.weekUsed);
    assert.ok(sameWeek, "other slots that week are marked used");
    const r2 = await call("POST", `/api/order/${tok}/weekly`, { slot: sameWeek.ts }); assert.equal(r2.status, 400); assert.match(r2.json.error, /already/);
    const nextWeek = w.slots.find(x => !x.taken && !x.weekUsed);
    assert.equal((await call("POST", `/api/order/${tok}/weekly`, { slot: nextWeek.ts })).status, 200, "next week is fine");
    assert.ok((await call("GET", "/api/slots")).json.find(x => x.ts === first.ts).taken, "weekly calls block the calendar");
    w = (await call("GET", `/api/order/${tok}/weekly`)).json;
    const later = w.booked.find(b => b.canCancel);
    if (later) { assert.equal((await call("DELETE", `/api/order/${tok}/weekly/${later.id}`)).status, 200); }
    assert.equal((await call("GET", `/api/order/${normal}/weekly`)).status, 404, "needs the follow-up");
    assert.ok(db.prepare("SELECT 1 FROM outbox WHERE to_addr='weekly@example.com' AND subject='Your weekly call is booked'").get());
  });

  server.close();
  const failed = results.filter(r => r[0] === "FAIL");
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(failed.length ? 1 : 0);
})();
