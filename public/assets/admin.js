(function () {
"use strict";
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = n => "$" + Number(n || 0).toFixed(2).replace(/\.00$/, "");
const myTZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } })();
function fmt(ts, tz, o) { try { return new Intl.DateTimeFormat("en-GB", { timeZone: tz || myTZ, ...o }).format(new Date(ts)); } catch { return new Date(ts).toISOString(); } }
const dt = (ts, tz) => ts ? fmt(ts, tz, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "–";
const badge = s => `<span class="status ${esc(s)}">${esc(String(s).replace("_", " "))}</span>`;
const wa = n => `https://wa.me/${String(n || "").replace(/\D/g, "")}`;
const PKG = { workout: "Workout", nutrition: "Nutrition", both: "Both" };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

async function api(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { "Content-Type": "application/json", ...(opts.headers || {}) } });
  if (r.status === 401) { showLogin(); throw new Error("Login required"); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Request failed");
  return j;
}
const view = $("view");
let ME = null, SETTINGS = null, tab = "overview";

/* ---------- login ---------- */
function showLogin() { $("login").hidden = false; $("app").hidden = true; $("logout").hidden = true; setTimeout(() => $("pw").focus(), 0); }
$("login").onsubmit = async e => {
  e.preventDefault(); $("loginerr").hidden = true;
  try { await api("/api/admin/login", { method: "POST", body: JSON.stringify({ password: $("pw").value }) }); $("pw").value = ""; start(); }
  catch (err) { $("loginerr").textContent = err.message; $("loginerr").hidden = false; }
};
$("logout").onclick = async () => { await fetch("/api/admin/logout", { method: "POST" }); showLogin(); };

async function start() {
  ME = await fetch("/api/admin/me").then(r => r.json());
  if (!ME.admin) return showLogin();
  $("login").hidden = true; $("app").hidden = false; $("logout").hidden = false;
  const w = [];
  if (ME.provider === "mock") w.push("<b>Test mode:</b> PAYMENT_PROVIDER is <code>mock</code>, so orders are marked paid without charging anyone. Switch to <code>paymob</code> or <code>stripe</code> before launch.");
  if (ME.missing && ME.missing.length) w.push(`<b>Payments not ready:</b> missing ${ME.missing.map(esc).join(", ")}.`);
  if (!ME.mail) w.push("<b>Email not connected:</b> set RESEND_API_KEY. Until then, emails are only saved in the Emails tab.");
  if (!ME.coachEmail) w.push("<b>No coach email:</b> set COACH_EMAIL to get notified about new orders.");
  $("setupwarn").innerHTML = w.length ? `<div class="warnbox" style="margin-bottom:14px;display:flex;flex-direction:column;gap:6px">${w.map(x => `<div>${x}</div>`).join("")}</div>` : "";
  SETTINGS = await api("/api/admin/settings");
  const h = location.hash.match(/order=([\w-]+)/);
  show(tab);
  if (h) openOrder(h[1]);
}
document.querySelectorAll("#tabs button").forEach(b => b.onclick = () => show(b.dataset.t));
function show(t) {
  tab = t;
  document.querySelectorAll("#tabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.t === t));
  view.innerHTML = `<p class="note"><span class="spin"></span>Loading…</p>`;
  ({ overview, orders, calls, follow, settings, foods, videos, blog, team, emails })[t]().catch(e => { view.innerHTML = `<div class="err">${esc(e.message)}</div>`; });
}

/* ---------- overview ---------- */
async function overview() {
  const o = await api("/api/admin/overview");
  view.innerHTML = `<div class="stats">
    <div class="stat"><div class="k">Revenue · 30 days</div><div class="v">${money(o.revenue30)}</div></div>
    <div class="stat"><div class="k">Plan orders · 30 days</div><div class="v">${o.orders30}</div></div>
    <div class="stat"><div class="k">Active follow-ups</div><div class="v">${o.activeFollow}</div></div>
    <div class="stat"><div class="k">Upcoming calls</div><div class="v">${o.upcomingCalls}</div></div>
    <div class="stat"><div class="k">Coach review · 30 days</div><div class="v">${o.needsReview}</div></div>
    <div class="stat"><div class="k">Revenue · all time</div><div class="v">${money(o.revenueAll)}</div></div>
  </div>
  <div class="panel sec" style="margin-top:16px"><h2>Packages · last 30 days</h2>
  ${o.byPkg.length ? `<table class="list"><thead><tr><th>Package</th><th>Orders</th><th>Revenue</th></tr></thead><tbody>${o.byPkg.map(r => `<tr><td>${esc(PKG[r.pkg] || r.pkg)}</td><td class="num">${r.n}</td><td class="num">${money(r.usd)}</td></tr>`).join("")}</tbody></table>` : `<p class="note">No paid orders yet.</p>`}</div>`;
}

/* ---------- orders ---------- */
let oq = { status: "paid", q: "" };
async function orders() {
  view.innerHTML = `<div class="toolbar"><input type="text" id="oq" placeholder="Search name, email, phone, order" value="${esc(oq.q)}">
    <select id="os">${["paid", "pending", "expired", "failed", "all"].map(s => `<option ${s === oq.status ? "selected" : ""}>${s}</option>`).join("")}</select></div>
    <div class="panel tablewrap" id="olist"></div>`;
  let t; $("oq").oninput = e => { clearTimeout(t); t = setTimeout(() => { oq.q = e.target.value; loadOrders(); }, 250); };
  $("os").onchange = e => { oq.status = e.target.value; loadOrders(); };
  await loadOrders();
}
async function loadOrders() {
  const rows = await api(`/api/admin/orders?status=${encodeURIComponent(oq.status)}&q=${encodeURIComponent(oq.q)}`);
  $("olist").innerHTML = rows.length ? `<table class="list"><thead><tr><th>Date</th><th>Order</th><th>Client</th><th>What</th><th>Total</th><th>Status</th></tr></thead><tbody>${rows.map(r => `
    <tr class="click" data-id="${esc(r.id)}" tabindex="0"><td class="num">${dt(r.paid_at || r.created_at)}</td><td class="num">${esc(r.id)}</td>
    <td>${esc(r.name)}<br><span class="note">${esc(r.email)}</span></td>
    <td>${r.kind === "addon" ? "Add-on: " + esc({ train_log: "Training tracker", food_log: "Nutrition tracker", videos: "Exercise videos", recipes: "Healthy recipes", supplements: "Supplements guide", cardio: "Cardio plan" }[JSON.parse(r.features || "[]")[0]] || "") : r.kind === "renewal" ? "Follow-up renewal" : esc(r.flagged ? "Coach review" : PKG[r.pkg] || "")}${r.follow ? " · follow-up" : ""}${r.call_ts ? " · call" : ""}${r.flagged ? " ⚠" : ""}</td>
    <td class="num">${money(r.total_usd)}</td><td>${badge(r.status)}</td></tr>`).join("")}</tbody></table>` : `<p class="note" style="padding:14px">No orders.</p>`;
  $("olist").querySelectorAll("tr.click").forEach(tr => { tr.onclick = () => openOrder(tr.dataset.id); tr.onkeydown = e => { if (e.key === "Enter") openOrder(tr.dataset.id); }; });
}
async function openOrder(id) {
  $("drawer").hidden = false; $("dh").textContent = id; $("dbody").innerHTML = `<p class="note"><span class="spin"></span>Loading…</p>`;
  const o = await api("/api/admin/orders/" + encodeURIComponent(id));
  const i = o.intake;
  const ctz = SETTINGS.availability.tz;
  $("dbody").innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${badge(o.status)}${o.flagged ? `<span class="status pending">coach review</span>` : ""}<span class="note">${esc(o.provider)} ${esc(o.providerRef || "")}</span></div>
    <dl class="kv">
      <dt>Client</dt><dd>${esc(o.name)}</dd>
      <dt>Email</dt><dd><a href="mailto:${esc(o.contact.email)}">${esc(o.contact.email)}</a></dd>
      <dt>Phone</dt><dd>${esc(o.contact.phone)}</dd>
      <dt>WhatsApp</dt><dd><a href="${wa(o.contact.wa)}" target="_blank" rel="noopener">${esc(o.contact.wa)}</a></dd>
      <dt>Created</dt><dd>${dt(o.createdAt)}${o.paidAt ? ` · paid ${dt(o.paidAt)}` : ""}</dd>
      ${i ? `<dt>Package</dt><dd>${esc(o.pkgName)} · ${i.region === "eg" ? "Egypt" : "Outside Egypt"}</dd>
      <dt>Client</dt><dd>${i.sex === "m" ? "Male" : "Female"}, ${i.age} y, ${i.wt} kg, ${i.ht} cm${i.bf ? `, ${i.bf}% fat` : ""}${i.bmr ? `, BMR ${i.bmr}` : ""}</dd>
      <dt>Language</dt><dd>${i.lang === "ar" ? "Arabic" : "English"}</dd>
      <dt>Goal</dt><dd>${esc({ loss: "Fat loss", gain: "Muscle gain", recomp: "Recomp", perf: "Performance" }[i.goal])} · ${i.days} days · ${esc({ beg: "beginner", int: "intermediate", adv: "advanced" }[i.lvl])} · ${esc(["full gym", "home dumbbells", "bodyweight"][i.eq])} · ${i.meals} meals</dd>` : ""}
      ${o.flags && o.flags.length ? `<dt>Health</dt><dd style="color:var(--warn)">${o.flags.map(esc).join("; ")}</dd>` : ""}
      ${i && i.injuries && i.injuries.length ? `<dt>Pain / injury</dt><dd style="color:var(--warn)">${i.injuries.map(k => esc({ lowback: "lower back" }[k] || k)).join(", ")} · exercises adjusted</dd>` : ""}
      ${i && i.medNotes ? `<dt>Medical notes</dt><dd>${esc(i.medNotes)}</dd>` : ""}
      ${o.call ? `<dt>Call</dt><dd>${dt(o.call.ts, ctz)} Cairo · client ${dt(o.call.ts, o.clientTz)} (${esc(o.clientTz)}) ${badge(o.call.status)}</dd>` : ""}
      ${o.features && o.features.length ? `<dt>Add-ons</dt><dd>${o.features.map(k => esc({ train_log: "Training tracker", food_log: "Nutrition tracker", videos: "Exercise videos", recipes: "Healthy recipes", supplements: "Supplements guide", cardio: "Cardio plan" }[k] || k)).join(", ")}</dd>` : ""}
      ${o.sub ? `<dt>Follow-up</dt><dd>${badge(o.sub.status)} ${money(o.sub.price_usd)}/mo · next ${dt(o.sub.next_charge_at)}</dd>` : ""}
    </dl>
    <div class="cart">${o.lines.map(l => `<div class="line"><span>${esc(l.label)}</span><span class="p">${money(l.usd)}</span></div>`).join("")}<div class="tot"><span>Total</span><span class="big">${money(o.total)}</span></div>
    ${o.charge.currency !== "USD" ? `<p class="note">Charged ${esc(o.charge.currency)} ${(o.charge.amount / 100).toLocaleString()}</p>` : ""}</div>
    <div class="actions">
      ${o.kind === "plan" ? `<a class="btn ghost" href="/plan/${encodeURIComponent(o.token)}" target="_blank" rel="noopener">Open client page</a>` : ""}
      ${o.status === "paid" ? `<button class="btn ghost" type="button" id="resend">Resend emails</button>` : `<button class="btn ghost" type="button" id="markpaid">Mark as paid (cash / transfer)</button>`}
    </div>
    <p class="note" id="dmsg"></p>
    <details><summary>History</summary><div class="events" style="margin-top:8px">${o.events.map(e => `<span>${dt(e.at)} · ${esc(e.type)}${e.detail ? " · " + esc(e.detail) : ""}</span>`).join("")}</div></details>`;
  const rs = $("resend"); if (rs) rs.onclick = async () => { rs.disabled = true; try { await api(`/api/admin/orders/${encodeURIComponent(id)}/resend`, { method: "POST" }); $("dmsg").textContent = "Emails sent again."; } catch (e) { $("dmsg").textContent = e.message; } rs.disabled = false; };
  const mp = $("markpaid"); if (mp) mp.onclick = async () => {
    if (!confirm("Mark this order as paid? Only do this if you received the money another way. The client gets their plan by email.")) return;
    try { await api(`/api/admin/orders/${encodeURIComponent(id)}/mark-paid`, { method: "POST" }); openOrder(id); if (tab === "orders") loadOrders(); } catch (e) { $("dmsg").textContent = e.message; }
  };
}
$("dclose").onclick = () => { $("drawer").hidden = true; history.replaceState(null, "", "/admin"); };
$("drawer").addEventListener("click", e => { if (e.target.id === "drawer") $("dclose").onclick(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("drawer").hidden) $("dclose").onclick(); });

/* ---------- calls ---------- */
let cscope = "upcoming";
async function calls() {
  const rows = await api("/api/admin/bookings?scope=" + cscope);
  const ctz = SETTINGS.availability.tz;
  view.innerHTML = `<div class="toolbar"><select id="cs"><option value="upcoming" ${cscope === "upcoming" ? "selected" : ""}>Upcoming</option><option value="past" ${cscope === "past" ? "selected" : ""}>Past</option></select>
    <span class="note">Times in ${esc(ctz.replace("_", " "))}.</span></div>
    <div class="panel tablewrap">${rows.length ? `<table class="list"><thead><tr><th>When</th><th>Client</th><th>WhatsApp</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(b => `
      <tr><td class="num">${fmt(b.ts, ctz, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}${b.kind === "weekly" ? `<br><span class="note">Weekly follow-up call</span>` : b.note ? `<br><span style="color:var(--bad)">${esc(b.note)}</span>` : ""}</td>
      <td><button type="button" class="linkbtn" data-o="${esc(b.order_id)}">${esc(b.name)}</button>${b.flagged ? " ⚠" : ""}<br><span class="note">client time ${fmt(b.ts, b.client_tz, { hour: "2-digit", minute: "2-digit" })}</span></td>
      <td><a href="${wa(b.wa)}" target="_blank" rel="noopener">${esc(b.wa)}</a></td><td>${badge(b.status)}</td>
      <td style="white-space:nowrap">${b.status === "confirmed" ? `<button class="btn small" data-b="${b.id}" data-s="done">Done</button> <button class="btn ghost small" data-b="${b.id}" data-r="1">Move</button> <button class="del" data-b="${b.id}" data-s="cancelled">Cancel</button>` : ""}</td></tr>`).join("")}</tbody></table>` : `<p class="note" style="padding:14px">No calls.</p>`}</div>`;
  $("cs").onchange = e => { cscope = e.target.value; show("calls"); };
  view.querySelectorAll("[data-o]").forEach(b => b.onclick = () => openOrder(b.dataset.o));
  view.querySelectorAll("[data-s]").forEach(b => b.onclick = async () => {
    if (b.dataset.s === "cancelled" && !confirm("Cancel this call? Refund the client yourself in the payment dashboard if needed.")) return;
    await api("/api/admin/bookings/" + b.dataset.b, { method: "PATCH", body: JSON.stringify({ status: b.dataset.s }) }); show("calls");
  });
  view.querySelectorAll("[data-r]").forEach(b => b.onclick = async () => {
    const slots = (await api("/api/slots")).filter(s => !s.taken);
    if (!slots.length) return alert("No free times in the calendar.");
    const td = b.closest("td");
    td.innerHTML = `<select id="mv">${slots.map(s => `<option value="${s.ts}">${fmt(s.ts, ctz, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</option>`).join("")}</select> <button class="btn small" id="mvok">Save</button>`;
    $("mvok").onclick = async () => { try { await api("/api/admin/bookings/" + b.dataset.b, { method: "PATCH", body: JSON.stringify({ ts: +$("mv").value }) }); show("calls"); } catch (e) { alert(e.message); } };
  });
}

/* ---------- follow-ups ---------- */
async function follow() {
  const rows = await api("/api/admin/subscriptions");
  view.innerHTML = `<div class="panel tablewrap">${rows.length ? `<table class="list"><thead><tr><th>Client</th><th>WhatsApp</th><th>Price</th><th>Next renewal</th><th>Billing</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(s => `
    <tr><td><button type="button" class="linkbtn" data-o="${esc(s.order_id)}">${esc(s.name)}</button><br><span class="note">${esc(s.email)}</span></td>
    <td><a href="${wa(s.wa)}" target="_blank" rel="noopener">${esc(s.wa)}</a></td><td class="num">${money(s.price_usd)}/mo</td>
    <td class="num">${s.status === "cancelled" ? "–" : fmt(s.next_charge_at, null, { day: "numeric", month: "short", year: "numeric" })}${s.pending_order_id ? `<br><span class="note">payment link sent</span>` : ""}</td>
    <td>${s.provider === "stripe" ? "Card, automatic" : "Payment link by email"}</td><td>${badge(s.status)}</td>
    <td>${s.status !== "cancelled" ? `<button class="del" data-c="${esc(s.id)}">Stop</button>` : ""}</td></tr>`).join("")}</tbody></table>` : `<p class="note" style="padding:14px">No follow-up clients yet.</p>`}</div>`;
  view.querySelectorAll("[data-o]").forEach(b => b.onclick = () => openOrder(b.dataset.o));
  view.querySelectorAll("[data-c]").forEach(b => b.onclick = async () => {
    if (!confirm("Stop this client's follow-up? No more renewals will be charged or requested.")) return;
    try { await api(`/api/admin/subscriptions/${encodeURIComponent(b.dataset.c)}/cancel`, { method: "POST" }); show("follow"); } catch (e) { alert(e.message); }
  });
}

/* ---------- settings ---------- */
async function settings() {
  SETTINGS = await api("/api/admin/settings");
  const p = SETTINGS.prices, a = SETTINGS.availability;
  const pl = [["workout", "Workout plan"], ["nutrition", "Nutrition plan"], ["both", "Bundle"], ["follow", "Coach follow-up / month (weekly check-in + weekly call)"], ["call", "One-off coach call"],
    ["train_log", "Training tracker"], ["food_log", "Nutrition tracker"], ["videos", "Exercise videos"], ["recipes", "Healthy recipes"], ["supplements", "Supplements guide"], ["cardio", "Cardio plan"]];
  view.innerHTML = `<form class="panel sec" id="sf" style="display:flex;flex-direction:column;gap:20px">
    <div><h2>Prices (USD)</h2><p class="sub">Everyone sees the same dollar prices.</p>
      <div class="formgrid">${pl.map(([k, l]) => `<label class="f">${l}<input type="number" step="0.5" min="0" name="p_${k}" value="${p[k]}"></label>`).join("")}</div></div>
    ${SETTINGS.chargeCurrency !== "USD" ? `<div><h2>Exchange rate</h2><p class="sub">Paymob charges in ${esc(SETTINGS.chargeCurrency)}. Dollar prices are converted with this rate at checkout.</p>
      <div class="formgrid"><label class="f">${esc(SETTINGS.chargeCurrency)} per $1<input type="number" step="0.01" min="0.01" name="fx" value="${SETTINGS.fx.usdToEgp}"></label></div></div>` : ""}
    <div><h2>Call hours</h2><p class="sub">Clients can book an hourly start time inside these hours.</p>
      <div class="formgrid">
        <label class="f">Coach time zone<input type="text" name="tz" value="${esc(a.tz)}"></label>
        <label class="f">First call starts (hour, 0–23)<input type="number" min="0" max="23" name="startHour" value="${a.startHour}"></label>
        <label class="f">Last call starts (hour, 0–23)<input type="number" min="0" max="23" name="endHour" value="${a.endHour}"></label>
        <label class="f">Call length (minutes)<input type="number" min="10" max="120" name="callMinutes" value="${a.callMinutes}"></label>
        <label class="f">Days bookable ahead<input type="number" min="1" max="60" name="horizonDays" value="${a.horizonDays}"></label>
        <label class="f">Minimum notice (hours)<input type="number" min="0" max="168" name="minNoticeHours" value="${a.minNoticeHours}"></label>
      </div>
      <p class="hint" style="margin-top:10px">Working days</p>
      <div class="daysel">${[6, 0, 1, 2, 3, 4, 5].map(d => `<label><input type="checkbox" name="day" value="${d}" ${a.days.includes(d) ? "checked" : ""}>${DAYS[d]}</label>`).join("")}</div></div>
    <div class="actions"><button class="btn" type="submit">Save</button><span class="note" id="smsg"></span></div></form>`;
  $("sf").onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = { prices: Object.fromEntries(pl.map(([k]) => [k, +f.get("p_" + k)])),
      availability: { tz: f.get("tz"), startHour: +f.get("startHour"), endHour: +f.get("endHour"), callMinutes: +f.get("callMinutes"), horizonDays: +f.get("horizonDays"), minNoticeHours: +f.get("minNoticeHours"), days: f.getAll("day").map(Number) } };
    if (f.get("fx")) body.fx = { usdToEgp: +f.get("fx") };
    try { await api("/api/admin/settings", { method: "PUT", body: JSON.stringify(body) }); $("smsg").textContent = "Saved. The website uses the new values now."; $("smsg").className = "note ok"; SETTINGS = await api("/api/admin/settings"); }
    catch (err) { $("smsg").textContent = err.message; $("smsg").className = "note"; }
  };
}

/* ---------- foods ---------- */
let FOODS = [], dirty = false, ffilter = "";
async function foods() { FOODS = await api("/api/admin/foods"); dirty = false; renderFoods(); }
const kcalCheck = f => f.kcal ? Math.abs(f.p * 4 + f.c * 4 + f.f * 9 - f.kcal) <= Math.max(8, f.kcal * 0.15) : false;
function renderFoods() {
  const cats = ["protein", "carb", "fruit", "fat", "veg", "other"];
  view.innerHTML = `<div class="panel sec"><h2>Food database</h2>
    <p class="sub">Every plan is built from this list. Values are per 100 g (cooked weight for meat, rice and pasta; dry for oats). Meals: B breakfast, L lunch, D dinner, S snack. Region decides who sees a food. "Goes with" keeps sweet and savory foods in separate meals. Type "other" foods only appear in the nutrition tracker. Plans already sold keep the foods they were built with.</p>
    <div class="toolbar"><input type="text" id="fsearch" placeholder="Filter foods" value="${esc(ffilter)}" aria-label="Filter foods"></div>
    <div class="dbbar"><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn small" id="fadd" type="button">Add food</button><button class="btn small" id="fsave" type="button" ${dirty ? "" : "disabled"}>Save changes</button><button class="btn ghost" id="freset" type="button">Reset to starter list</button></div>
    <span class="note" id="fmsg">${FOODS.length} foods${dirty ? " · unsaved changes" : ""}</span></div>
    <div class="tablewrap"><table class="db"><thead><tr><th>Food</th><th>Type</th><th>kcal</th><th>Protein g</th><th>Carbs g</th><th>Fat g</th><th>Meals</th><th>Region</th><th>Unit</th><th>g / unit</th><th>Arabic name</th><th>Goes with</th><th>Recipe step ({g} = grams)</th><th>Arabic recipe step</th><th>Check</th><th></th></tr></thead><tbody>${FOODS.map((f, i) => (ffilter && !(f.name + " " + f.cat).toLowerCase().includes(ffilter.toLowerCase())) ? "" : `<tr data-i="${i}">
      <td class="nmc"><input type="text" data-k="name" value="${esc(f.name)}" aria-label="Food name"></td>
      <td><select data-k="cat" aria-label="Type">${cats.map(c => `<option ${c === f.cat ? "selected" : ""}>${c}</option>`).join("")}</select></td>
      ${["kcal", "p", "c", "f"].map(k => `<td><input type="number" step="0.1" min="0" data-k="${k}" value="${f[k]}" aria-label="${k}"></td>`).join("")}
      <td><div class="slots">${["B", "L", "D", "S"].map(s => `<label><input type="checkbox" data-s="${s}" ${String(f.slots).includes(s) ? "checked" : ""}>${s}</label>`).join("")}</div></td>
      <td><select data-k="reg" aria-label="Region">${[["all", "Everyone"], ["eg", "Egypt"], ["intl", "Outside Egypt"]].map(([v, l]) => `<option value="${v}" ${(f.reg || "all") === v ? "selected" : ""}>${l}</option>`).join("")}</select></td>
      <td><input type="text" data-k="unit" value="${esc(f.unit || "")}" style="width:80px" aria-label="Unit name"></td>
      <td><input type="number" min="0" data-k="unitG" value="${f.unitG || ""}" aria-label="Grams per unit"></td>
      <td><input type="text" data-k="nameAr" dir="rtl" value="${esc(f.nameAr || "")}" style="min-width:160px" aria-label="Arabic name"></td>
      <td><select data-k="style" aria-label="Goes with">${[["any", "Anything"], ["savory", "Savory"], ["sweet", "Sweet"]].map(([v, l]) => `<option value="${v}" ${(f.style || "any") === v ? "selected" : ""}>${l}</option>`).join("")}</select></td>
      <td><input type="text" data-k="prep" value="${esc(f.prep || "")}" style="min-width:260px" aria-label="Recipe step"></td>
      <td><input type="text" data-k="prepAr" dir="rtl" value="${esc(f.prepAr || "")}" style="min-width:260px" aria-label="Arabic recipe step"></td>
      <td><span class="kchk ${kcalCheck(f) ? "ok" : "bad"}">${kcalCheck(f) ? "OK" : "Check"}</span></td>
      <td><button class="del" type="button" data-del="${i}">Remove</button></td></tr>`).join("")}</tbody></table></div>
    <p class="note" style="margin-top:10px">Check compares kcal with protein×4 + carbs×4 + fat×9. A flag usually means a typo.</p></div>`;
  $("fsearch").oninput = e => { const pos = e.target.selectionStart; ffilter = e.target.value; renderFoods(); const n = $("fsearch"); n.focus(); n.setSelectionRange(pos, pos); };
  const mark = () => { dirty = true; $("fsave").disabled = false; $("fmsg").textContent = `${FOODS.length} foods · unsaved changes`; };
  view.querySelectorAll("tr[data-i]").forEach(tr => {
    const f = FOODS[+tr.dataset.i];
    tr.querySelectorAll("[data-k]").forEach(inp => inp.onchange = () => {
      const k = inp.dataset.k; f[k] = ["name", "cat", "unit", "reg", "style", "prep", "nameAr", "prepAr"].includes(k) ? inp.value : (parseFloat(inp.value) || 0);
      if (["kcal", "p", "c", "f"].includes(k)) { const ch = tr.querySelector(".kchk"); ch.className = "kchk " + (kcalCheck(f) ? "ok" : "bad"); ch.textContent = kcalCheck(f) ? "OK" : "Check"; }
      mark();
    });
    tr.querySelectorAll("[data-s]").forEach(cb => cb.onchange = () => { f.slots = [...tr.querySelectorAll("[data-s]:checked")].map(x => x.dataset.s).join(""); mark(); });
  });
  view.querySelectorAll("[data-del]").forEach(b => b.onclick = () => { FOODS.splice(+b.dataset.del, 1); dirty = true; renderFoods(); });
  $("fadd").onclick = () => { FOODS.unshift({ id: "", name: "New food", cat: "protein", kcal: 0, p: 0, c: 0, f: 0, slots: "LD", unit: "", unitG: 0, reg: "all" }); dirty = true; renderFoods(); };
  $("fsave").onclick = async () => {
    try { const r = await api("/api/admin/foods", { method: "PUT", body: JSON.stringify({ foods: FOODS }) }); FOODS = r.foods; dirty = false; renderFoods(); $("fmsg").textContent = `${FOODS.length} foods · saved`; }
    catch (e) { $("fmsg").textContent = e.message; }
  };
  $("freset").onclick = async () => {
    if (!confirm("Replace the whole food list with the starter list? Your own foods will be removed.")) return;
    const r = await api("/api/admin/foods/reset", { method: "POST" }); FOODS = r.foods; dirty = false; renderFoods();
  };
}
window.addEventListener("beforeunload", e => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

/* ---------- exercise videos ---------- */
async function videos() {
  const v = await api("/api/admin/videos");
  const done = v.exercises.filter(x => x.ok).length;
  view.innerHTML = `<form class="panel sec" id="vf" style="display:flex;flex-direction:column;gap:14px">
    <div><h2>Exercise videos</h2><p class="sub">Paste a YouTube (unlisted is fine), Vimeo, or direct .mp4 link for each exercise. Clients who buy the video add-on see it beside the exercise, together with the form cues below it.</p></div>
    <div class="warnbox">${done} of ${v.exercises.length} exercises have a video. ${done < v.exercises.length ? "Exercises without one show the form cues and \"Video coming soon\"." : "All exercises are covered."}</div>
    <div class="checks"><label><input type="checkbox" id="voffer" ${v.offer ? "checked" : ""}>Sell the video add-on on the website</label></div>
    <div class="tablewrap"><table class="list"><thead><tr><th>Exercise</th><th>Video link</th><th>Form cues</th></tr></thead><tbody>
      ${v.exercises.map((x, i) => `<tr><td style="min-width:180px">${esc(x.ex)}</td><td><input type="url" data-ex="${esc(x.ex)}" value="${esc(x.url)}" placeholder="https://youtu.be/…" style="min-width:260px" aria-label="Video link for ${esc(x.ex)}">${x.url && !x.ok ? `<br><span class="note" style="color:var(--bad)">Not a supported link</span>` : ""}</td><td class="note" style="min-width:260px">${x.cues.map(esc).join("<br>")}</td></tr>`).join("")}
    </tbody></table></div>
    <div class="actions"><button class="btn" type="submit">Save</button><span class="note" id="vmsg"></span></div></form>`;
  $("vf").onsubmit = async e => {
    e.preventDefault();
    const urls = {}; view.querySelectorAll("[data-ex]").forEach(i => { urls[i.dataset.ex] = i.value.trim(); }); // an emptied box is sent as "" so it stays cleared
    try { await api("/api/admin/videos", { method: "PUT", body: JSON.stringify({ offer: $("voffer").checked, urls }) }); await videos(); $("vmsg").textContent = "Saved."; }
    catch (err) { $("vmsg").textContent = err.message; }
  };
}

/* ---------- blog ---------- */
const POST_HREF = p => "/blog/" + encodeURIComponent(p.slug);
async function blog() {
  const posts = await api("/api/admin/posts");
  view.innerHTML = `<div class="panel sec"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
      <div><h2>Blog</h2><p class="sub">Articles appear on the website at <a href="/blog" target="_blank" rel="noopener">/blog</a> and the latest three on the home page. Write in English or Arabic.</p></div>
      <button class="btn" type="button" id="newpost">New article</button></div>
    <div class="tablewrap" style="margin-top:12px">${posts.length ? `<table class="list"><thead><tr><th>Title</th><th>Language</th><th>Status</th><th>Date</th><th></th></tr></thead><tbody>
      ${posts.map(p => `<tr><td><button type="button" class="linkbtn" data-edit="${p.id}">${esc(p.title)}</button><br><span class="note">/blog/${esc(p.slug)}</span></td>
        <td>${p.lang === "ar" ? "Arabic" : "English"}</td><td>${p.published ? badge("published") : `<span class="status pending">draft</span>`}</td>
        <td class="num">${dt(p.published_at || p.created_at)}</td><td>${p.published ? `<a href="${POST_HREF(p)}" target="_blank" rel="noopener">View</a>` : ""}</td></tr>`).join("")}
      </tbody></table>` : `<p class="note">No articles yet.</p>`}</div></div>`;
  $("newpost").onclick = () => editPost(null);
  view.querySelectorAll("[data-edit]").forEach(b => b.onclick = () => editPost(posts.find(p => p.id === +b.dataset.edit)));
}
function editPost(p) {
  const v = p || { title: "", slug: "", lang: "en", tag: "", author: "Repvo team", excerpt: "", body: "## First heading\n\nWrite your article here. Leave an empty line between paragraphs.\n\n- Bullet points start with a dash\n- **bold** and *italic* work too", published: 0 };
  $("drawer").hidden = false; $("dh").textContent = p ? "Edit article" : "New article";
  $("dbody").innerHTML = `<form id="pf" style="display:flex;flex-direction:column;gap:12px">
    <label class="f">Title<input type="text" id="p-title" maxlength="160" value="${esc(v.title)}" required></label>
    <div class="row"><label class="f">Language<select id="p-lang"><option value="en" ${v.lang !== "ar" ? "selected" : ""}>English</option><option value="ar" ${v.lang === "ar" ? "selected" : ""}>Arabic</option></select></label>
      <label class="f">Topic tag<input type="text" id="p-tag" maxlength="30" value="${esc(v.tag)}" placeholder="Nutrition, Training…"></label></div>
    <div class="row"><label class="f">Author<input type="text" id="p-author" maxlength="80" value="${esc(v.author)}"></label>
      <label class="f">Web address (slug)<input type="text" id="p-slug" maxlength="80" value="${esc(v.slug)}" placeholder="made from the title"></label></div>
    <label class="f">Short summary (shows on the cards and in Google)<textarea id="p-excerpt" rows="2" maxlength="300">${esc(v.excerpt)}</textarea></label>
    <label class="f">Article<textarea id="p-body" rows="16" style="font:14px/1.5 var(--f-mono)">${esc(v.body)}</textarea></label>
    <p class="note">Formatting: <code>## Heading</code>, <code>### Smaller heading</code>, <code>- bullet</code>, <code>1. numbered</code>, <code>&gt; quote</code>, <code>**bold**</code>, <code>*italic*</code>, <code>[link text](https://…)</code>. Empty line = new paragraph.</p>
    <details open><summary>Preview</summary><div class="mdprev prose" id="p-prev"></div></details>
    <div class="checks"><label><input type="checkbox" id="p-pub" ${v.published ? "checked" : ""}>Published (visible on the website)</label></div>
    <div class="actions"><button class="btn" type="submit">Save</button>${p ? `<button class="btn ghost" type="button" id="p-del">Delete</button>` : ""}<span class="note" id="p-msg"></span></div></form>`;
  const prev = () => { const box = $("p-prev"); box.dir = $("p-lang").value === "ar" ? "rtl" : "ltr"; box.innerHTML = window.BLOG ? BLOG.md($("p-body").value) : ""; };
  $("p-body").oninput = prev; $("p-lang").onchange = prev; prev();
  $("pf").onsubmit = async e => {
    e.preventDefault(); $("p-msg").textContent = "";
    const body = { title: $("p-title").value, lang: $("p-lang").value, tag: $("p-tag").value, author: $("p-author").value, slug: $("p-slug").value, excerpt: $("p-excerpt").value, body: $("p-body").value, published: $("p-pub").checked };
    try { await api(p ? `/api/admin/posts/${p.id}` : "/api/admin/posts", { method: p ? "PUT" : "POST", body: JSON.stringify(body) }); $("drawer").hidden = true; blog(); }
    catch (err) { $("p-msg").textContent = err.message; }
  };
  if ($("p-del")) $("p-del").onclick = async () => {
    if ($("p-del").dataset.sure !== "1") { $("p-del").dataset.sure = "1"; $("p-del").textContent = "Click again to delete"; return; }
    try { await api(`/api/admin/posts/${p.id}`, { method: "DELETE" }); $("drawer").hidden = true; blog(); } catch (err) { $("p-msg").textContent = err.message; }
  };
}

/* ---------- team ---------- */
async function team() {
  const { members } = await api("/api/admin/team");
  const row = (m, i) => `<div class="feat" data-m="${i}" style="display:flex;flex-direction:column;gap:8px">
    <div class="row"><label class="f">Name<input type="text" data-k="name" maxlength="80" value="${esc(m.name)}"></label><label class="f">Role<input type="text" data-k="role" maxlength="80" value="${esc(m.role)}"></label></div>
    <label class="f">Short bio<textarea data-k="bio" rows="2" maxlength="500">${esc(m.bio)}</textarea></label>
    <label class="f">Qualifications (comma separated)<input type="text" data-k="creds" value="${esc((m.creds || []).join(", "))}"></label>
    <button class="linkbtn" type="button" data-rm="${i}" style="align-self:flex-start">Remove</button></div>`;
  let list = members.slice();
  const draw = () => {
    view.innerHTML = `<form class="panel sec" id="tf" style="display:flex;flex-direction:column;gap:12px">
      <div><h2>Team</h2><p class="sub">Shown on the home page under "Built by a well-educated team". Only list real people and qualifications they actually hold.</p></div>
      ${list.map(row).join("")}
      <div class="actions"><button class="btn ghost" type="button" id="addm">Add a person</button><button class="btn" type="submit">Save</button><span class="note" id="tmsg"></span></div></form>`;
    const read = () => { list = [...view.querySelectorAll("[data-m]")].map(el => ({ name: el.querySelector('[data-k="name"]').value, role: el.querySelector('[data-k="role"]').value, bio: el.querySelector('[data-k="bio"]').value, creds: el.querySelector('[data-k="creds"]').value })); };
    $("addm").onclick = () => { read(); list.push({ name: "", role: "", bio: "", creds: [] }); draw(); };
    view.querySelectorAll("[data-rm]").forEach(b => b.onclick = () => { read(); list.splice(+b.dataset.rm, 1); draw(); });
    $("tf").onsubmit = async e => { e.preventDefault(); read(); try { const r = await api("/api/admin/team", { method: "PUT", body: JSON.stringify({ members: list }) }); list = r.members; draw(); $("tmsg").textContent = "Saved."; } catch (err) { $("tmsg").textContent = err.message; } };
  };
  draw();
}

/* ---------- emails ---------- */
async function emails() {
  const rows = await api("/api/admin/outbox");
  view.innerHTML = `<div class="panel tablewrap">${rows.length ? `<table class="list"><thead><tr><th>Date</th><th>To</th><th>Subject</th><th>Status</th></tr></thead><tbody>${rows.map(m => `
    <tr><td class="num">${dt(m.created_at)}</td><td>${esc(m.to_addr)}</td><td><a href="/api/admin/outbox/${m.id}" target="_blank" rel="noopener">${esc(m.subject)}</a></td>
    <td>${badge(m.status)}${m.error ? `<br><span class="note">${esc(m.error)}</span>` : ""}</td></tr>`).join("")}</tbody></table>` : `<p class="note" style="padding:14px">No emails yet.</p>`}</div>
    <p class="note" style="margin-top:8px">"logged" means email isn't connected yet (RESEND_API_KEY), so the message was saved here but not sent.</p>`;
}

start();
})();
