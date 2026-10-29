(function () {
"use strict";
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = n => "$" + Number(n).toFixed(2).replace(/\.00$/, "");
const api = async (url, opts = {}) => {
  const r = await fetch(url, { ...opts, headers: { "Content-Type": "application/json", ...(opts.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || "Something went wrong. Please try again."), { data: j });
  return j;
};

let CFG = null;          // server config: prices, call settings
let FOODS = [];          // foods for the selected region (no macros)
const excluded = new Set();
let addons = { follow: false, call: false, train_log: false, food_log: false, videos: false, recipes: false, supplements: false, cardio: false };
const EXTRAS = [
  { key: "train_log", needs: "workout", title: "Training tracker", text: "Log the weight and reps of every set and see your strength go up week by week." },
  { key: "food_log", needs: "nutrition", title: "Nutrition tracker", text: "Log what you eat from 125+ foods, including Egyptian dishes, and see calories and macros against your targets." },
  { key: "videos", needs: "workout", title: "Exercise videos", text: "A coach video and form cues beside every exercise in your plan." },
  { key: "recipes", needs: "nutrition", title: "Healthy recipes", text: "A simple, tasty recipe for every meal, using the exact foods and grams in your plan." },
  { key: "cardio", needs: "any", title: "Cardio plan", text: "Weekly cardio built around your lifting days: heart-rate zones for your age, sessions that progress over 4 weeks and a daily step goal." },
  { key: "supplements", needs: "any", title: "Supplements guide", text: "What's worth taking for your goal, how much and when, and what to skip. Doses set for your body weight." },
];
const pkgHas = (pkg, part) => part === "any" || pkg === "both" || pkg === part;
const extrasFor = (pkg, flagged) => flagged ? [] : EXTRAS.filter(x => pkgHas(pkg, x.needs) && (x.key !== "videos" || CFG.videosOn));
let slot = null;
let busy = false, errorMsg = "", autoCall = false;
const MEALS = { 3: [["Breakfast", "B"], ["Lunch", "L"], ["Dinner", "D"]], 4: [["Breakfast", "B"], ["Lunch", "L"], ["Snack", "S"], ["Dinner", "D"]], 5: [["Breakfast", "B"], ["Snack", "S"], ["Lunch", "L"], ["Snack", "S"], ["Dinner", "D"]] };
const INJ = { neck: "neck", shoulder: "shoulder", elbow: "elbow", wrist: "wrist", lowback: "lower back", hip: "hip", knee: "knee", ankle: "ankle" };
const SPLITS = { 2: "Upper / lower", 3: "Push / pull / legs", 4: "Upper / lower with different A and B days", 5: "Pro split: chest, back, shoulders, legs, arms", 6: "Push / pull / legs twice a week" };
const LEVELS = {
  beg: "<b>Beginner:</b> new to the gym, less than 6 months of regular training, or coming back after a long break. You'll focus on learning each movement with good form, core work uses timed holds, and cardio starts gentle.",
  int: "<b>Intermediate:</b> 6 months to about 3 years of regular training. You know the main lifts (squat, bench press, rows, deadlift) and can still add weight or reps most weeks.",
  adv: "<b>Advanced:</b> 3+ years of consistent, structured training. Your lifts now go up slowly, you train close to failure with good form, and you can handle harder intervals.",
};
const PKGNAME = { workout: "Workout plan", nutrition: "Nutrition plan", both: "Workout + nutrition bundle" };
const userTZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } })();
let clientTZ = userTZ;

/* ---------- time helpers ---------- */
function fmt(ts, tz, o) { try { return new Intl.DateTimeFormat("en-US", { timeZone: tz, ...o }).format(new Date(ts)); } catch { return new Date(ts).toUTCString(); } }
const tzName = tz => { try { return fmt(Date.now(), tz, { timeZoneName: "short" }).split(" ").pop(); } catch { return tz; } };
const ordinal = n => { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const slotText = ts => `${fmt(ts, clientTZ, { weekday: "short", day: "numeric", month: "short" })} · ${fmt(ts, clientTZ, { hour: "numeric", minute: "2-digit" })}–${fmt(ts + CFG.callMinutes * 60000, clientTZ, { hour: "numeric", minute: "2-digit" })}`;

/* ---------- draft saved in this browser, so a cancelled payment doesn't lose the form ---------- */
const DRAFT = "fitplan_draft_v1";
function saveDraft() {
  try {
    const d = { fields: {}, radios: {}, checks: {}, excluded: [...excluded], addons };
    document.querySelectorAll("#intake input, #intake select, #intake textarea").forEach(el => {
      if (el.type === "radio") { if (el.checked) d.radios[el.name] = el.value; }
      else if (el.type === "checkbox") d.checks[el.id] = el.checked;
      else if (el.id) d.fields[el.id] = el.value;
    });
    localStorage.setItem(DRAFT, JSON.stringify(d));
  } catch {}
}
function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT) || "null");
    if (!d) return false;
    Object.entries(d.fields || {}).forEach(([id, v]) => { if ($(id)) $(id).value = v; });
    Object.entries(d.radios || {}).forEach(([n, v]) => { const el = document.querySelector(`input[name="${n}"][value="${CSS.escape(v)}"]`); if (el) el.checked = true; });
    Object.entries(d.checks || {}).forEach(([id, v]) => { if ($(id)) $(id).checked = v; });
    (d.excluded || []).forEach(x => excluded.add(x));
    if (d.addons) ["follow", "train_log", "food_log", "videos", "recipes", "supplements", "cardio"].forEach(k => (addons[k] = !!d.addons[k]));
    return true;
  } catch { return false; }
}

/* ---------- routing ---------- */
function route() {
  const h = (location.hash || "").slice(1);
  const app = h === "start";
  $("view-home").hidden = app; $("appwrap").hidden = !app;
  $("view-client").hidden = !app;
  if (app) { build(); window.scrollTo(0, 0); }
  else if (h && $(h)) requestAnimationFrame(() => $(h).scrollIntoView());
  else if (!h) window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);
document.querySelectorAll("a[data-pkg]").forEach(a => a.addEventListener("click", () => {
  const id = { workout: "pkg-w", nutrition: "pkg-n", both: "pkg-b" }[a.dataset.pkg]; $(id).checked = true;
}));

/* ---------- form ---------- */
const curReg = () => { const r = document.querySelector('input[name="reg"]:checked'); return r ? r.value : "intl"; };
function readForm() {
  const v = n => document.querySelector(`input[name="${n}"]:checked`).value;
  const num = id => { const x = parseFloat($(id).value); return isFinite(x) ? x : null; };
  return {
    intake: { region: curReg(), lang: v("lang"), pkg: v("pkg"), goal: v("goal"), sex: v("sex"), age: num("age"), wt: num("wt"), ht: num("ht"), act: parseFloat($("act").value),
      bf: num("bf"), bmr: num("bmr"), days: +$("days").value, lvl: $("lvl").value, eq: +$("eq").value, meals: +$("meals").value,
      flags: [...document.querySelectorAll("#flags input:checked")].map(x => x.value),
      injuries: [...document.querySelectorAll("#inj input:checked")].map(x => x.value), medNotes: $("medNotes").value.trim() },
    contact: { name: $("name").value.trim(), email: $("email").value.trim(), phone: $("phone").value.trim(), wa: ($("wasame").checked ? $("phone").value : $("wa").value).trim() },
  };
}
const okEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const okPhone = p => /^\+?[\d\s().-]+$/.test(p) && p.replace(/\D/g, "").length >= 8 && p.replace(/\D/g, "").length <= 15;
function issues(f) {
  const m = [], i = f.intake, c = f.contact;
  if (!i.age || i.age < 10 || i.age > 90) m.push("your age");
  if (!i.wt || i.wt < 30 || i.wt > 300) m.push("your weight in kg");
  if (!i.ht || i.ht < 120 || i.ht > 230) m.push("your height in cm");
  if (i.bf !== null && (i.bf < 3 || i.bf > 70)) m.push("a body fat % between 3 and 70 (or leave it empty)");
  if (i.bmr !== null && (i.bmr < 500 || i.bmr > 5000)) m.push("a scan BMR between 500 and 5000 (or leave it empty)");
  if (c.name.length < 2) m.push("your name");
  if (!okEmail(c.email)) m.push("a valid email");
  if (!okPhone(c.phone)) m.push("a phone number with country code");
  if (!okPhone(c.wa)) m.push("a WhatsApp number with country code");
  return m;
}

/* ---------- foods you don't eat ---------- */
const CATNAME = { protein: "Protein", carb: "Carbs", fruit: "Fruit", fat: "Fats", veg: "Vegetables" };
async function loadFoods() {
  try { FOODS = await api("/api/foods?region=" + curReg()); } catch { FOODS = []; }
  renderAvoid(); build();
}
function renderAvoid() {
  $("avoid").innerHTML = Object.keys(CATNAME).map(cat => {
    const l = FOODS.filter(f => f.cat === cat); if (!l.length) return "";
    return `<div class="grp"><span class="gt">${CATNAME[cat]}</span><div class="ch">${l.map(f => `<button type="button" data-id="${esc(f.id)}" aria-pressed="${excluded.has(f.id)}">${esc(f.name)}</button>`).join("")}</div></div>`;
  }).join("");
  $("avoid").querySelectorAll("button").forEach(b => b.onclick = () => {
    const id = b.dataset.id; excluded.has(id) ? excluded.delete(id) : excluded.add(id);
    b.setAttribute("aria-pressed", excluded.has(id)); build();
  });
}
function avoidStatus(i) {
  const info = $("avoidinfo");
  const left = FOODS.filter(f => !excluded.has(f.id));
  const n = FOODS.length - left.length;
  const gaps = [...new Set(MEALS[i.meals].filter(m => !left.some(f => f.cat === "protein" && String(f.slots).includes(m[1]))).map(m => m[0]))];
  if (gaps.length && FOODS.length) { info.textContent = `${gaps.join(" and ")} ${gaps.length > 1 ? "have" : "has"} no protein option left. Keep at least one protein food for ${gaps.length > 1 ? "these meals" : "this meal"}.`; info.className = "hint warn"; }
  else { info.textContent = n ? `${n} food${n > 1 ? "s" : ""} left out of your plan.` : ""; info.className = "hint"; }
  $("avoidset").hidden = i.pkg === "workout";
  return { n, gaps: FOODS.length ? gaps : [] };
}

/* ---------- prices ---------- */
function paintPrices() {
  if (!CFG) return;
  document.querySelectorAll(".pz").forEach(e => { e.textContent = money(CFG.prices[e.dataset.k] || 0); });
  document.querySelectorAll("[data-videos]").forEach(e => { e.hidden = !CFG.videosOn; });
  ["workout", "nutrition", "both"].forEach(k => $("pr-" + k).textContent = money(CFG.prices[k]));
  $("reghint").textContent = curReg() === "eg" ? "Your plan uses Egyptian foods like ful, baladi bread and areesh." : "Your plan uses foods that are easy to find worldwide.";
}

/* ---------- output column ---------- */
const LOCK = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M7 11V8a5 5 0 0 1 10 0v3"/><rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor"/></svg>`;
function summaryHTML(i, n) {
  const inc = [];
  if (i.pkg !== "workout") { inc.push("Daily calorie and macro targets from your body data", `${i.meals} meals a day with exact grams for every food`, "One-tap food swaps that keep you on target"); if (n) inc.push(`Built without the ${n} food${n > 1 ? "s" : ""} you don't eat`); }
  if (i.pkg !== "nutrition") inc.push(`${i.days} training days for ${["the gym", "home with dumbbells", "bodyweight only"][i.eq]}`, `${SPLITS[i.days] || "Your split"}, 4 sets per exercise, reps and rest matched to your goal`, "A 4-week progression, then a new phase");
  if (i.pkg !== "nutrition" && i.injuries.length) inc.push(`Exercises adjusted for your ${i.injuries.map(k => INJ[k]).join(", ")}: anything that loads it is swapped for a safer option`);
  const ghost = [62, 48, 70, 55].map(w => `<div class="gl"><span style="width:${w}%"></span><span style="width:18%"></span></div>`).join("");
  return `<div class="panel sec lock"><div class="lk-badge">${LOCK}<span>Unlocks after payment</span></div>
    <h2>What your plan includes</h2><p class="sub">Built from the details you enter. It opens the moment payment goes through, and we email you the link.</p>
    <ul class="incl">${inc.map(x => `<li>${esc(x)}</li>`).join("")}</ul><div class="skel" aria-hidden="true">${ghost}</div></div>`;
}
function build() {
  if (!CFG) return;
  paintPrices();
  $("lvlhint").innerHTML = LEVELS[$("lvl").value] + " <span>Not sure? Pick the lower level.</span>";
  const f = readForm(), i = f.intake;
  $("wa").disabled = $("wasame").checked;
  if ($("wasame").checked) $("wa").value = $("phone").value;
  const av = avoidStatus(i);
  const flagged = i.flags.length > 0 || (i.age !== null && i.age < 18);
  // a health flag makes the call required; undo that automatically if the flag is removed
  if (flagged && !addons.call) { addons.call = true; autoCall = true; }
  if (!flagged && autoCall) { if (!slot) addons.call = false; autoCall = false; }
  let html = "";
  if (flagged) {
    const why = (i.age !== null && i.age < 18 ? ["You are under 18"] : []).concat(i.flags.map(k => CFG.flags[k]));
    html += `<div class="flag"><h2>A coach will build your plan with you</h2><p>You told us: <b>${why.map(esc).join("; ")}</b>. To keep you safe we don't generate an automatic plan in this case. Book a ${CFG.callMinutes}-minute call and a coach will set your plan with you.</p></div>`;
  } else html += summaryHTML(i, av.n);
  $("out").innerHTML = html + cartHTML(f, flagged, av.gaps);
  wireCart(flagged);
  saveDraft();
}
function cartHTML(f, flagged, gaps) {
  const i = f.intake, P = CFG.prices;
  const base = flagged ? 0 : P[i.pkg];
  const extras = extrasFor(i.pkg, flagged);
  const today = base + extras.reduce((a, x) => a + (addons[x.key] ? P[x.key] : 0), 0) + (addons.follow ? P.follow : 0) + (addons.call ? P.call : 0);
  const day = new Date().getDate();
  const miss = issues(f);
  const terms = $("agree") ? $("agree").checked : false;
  const blockers = flagged || i.pkg === "workout" ? [] : gaps;
  const canPay = !busy && today > 0 && !(addons.call && !slot) && !miss.length && !blockers.length && terms;
  const label = busy ? `<span class="spin"></span>Opening secure payment…`
    : blockers.length ? "Keep a protein option for every meal"
    : addons.call && !slot ? "Choose a call time first"
    : miss.length ? "Add your details to continue"
    : !terms ? "Accept the terms to continue"
    : `Pay ${money(today)}`;
  const fx = CFG.fxRate ? `<p class="fxnote">Charged in ${esc(CFG.chargeCurrency)}: about ${esc(CFG.chargeCurrency)} ${Math.round(today * CFG.fxRate).toLocaleString("en-US")} at ${CFG.fxRate} per $1.</p>` : "";
  return `<div class="panel sec" id="checkout"><h2>Checkout</h2><p class="sub">Secure card payment. Everything below is charged today.</p>
  <div class="cart">
    ${flagged ? "" : `<div class="line"><span>${PKGNAME[i.pkg]}</span><span class="p">${money(base)}</span></div>`}
    ${extras.length ? `<p class="hint" style="margin:6px 0 0">Add to your plan</p>` + extras.map(x => `<label class="addon"><input type="checkbox" id="ad-${x.key}" data-x="${x.key}" ${addons[x.key] ? "checked" : ""}><span class="tx"><b>${x.title}</b><small>${x.text}</small></span><span class="p">${money(P[x.key])}</span></label>`).join("") + `<p class="hint" style="margin:6px 0 0">Coaching</p>` : ""}
    <label class="addon"><input type="checkbox" id="ad-follow" ${addons.follow ? "checked" : ""}><span class="tx"><b>Coach follow-up</b><small>Weekly check-in and one call with your coach every week, plus plan adjustments and WhatsApp chat. First month charged today, then monthly on the ${ordinal(day)}. Stop any time.</small></span><span class="p">${money(P.follow)}/mo</span></label>
    <label class="addon"><input type="checkbox" id="ad-call" ${addons.call ? "checked" : ""} ${flagged ? "disabled" : ""}><span class="tx"><b>${flagged ? `${CFG.callMinutes}-minute call with a coach (required)` : `One-off ${CFG.callMinutes}-minute call`}</b><small>${slot ? `<span class="when">${esc(slotText(slot))} ${esc(tzName(clientTZ))}</span> <button type="button" class="linkbtn" id="chg">Change time</button>` : `<button type="button" class="linkbtn" id="pick">Pick a time</button> · times show in your own time zone.`}</small></span><span class="p">${money(P.call)}</span></label>
    <div class="tot"><span>Due today</span><span class="big">${money(today)}</span></div>${fx}
    <div class="checks"><label><input type="checkbox" id="agree" ${terms ? "checked" : ""}><span>I agree to the <a href="/terms" target="_blank" rel="noopener">terms, refund and privacy policy</a>, and I understand this is general fitness guidance, not medical advice.</span></label></div>
    <button class="btn" type="button" id="pay" ${canPay ? "" : "disabled"}>${label}</button>
    ${miss.length ? `<p class="note">Still needed: ${esc(miss.join(", "))}.</p>` : ""}
    ${errorMsg ? `<div class="err" role="alert">${esc(errorMsg)}</div>` : ""}
  </div></div>`;
}
function wireCart(flagged) {
  $("ad-follow").onchange = e => { addons.follow = e.target.checked; build(); };
  document.querySelectorAll("[data-x]").forEach(cb => cb.onchange = () => { addons[cb.dataset.x] = cb.checked; build(); });
  $("ad-call").onchange = e => { addons.call = e.target.checked; if (addons.call) { if (!slot) openCal(); } else slot = null; build(); };
  $("agree").onchange = () => build();
  const ch = $("chg") || $("pick"); if (ch) ch.onclick = e => { e.preventDefault(); openCal(); };
  $("pay").onclick = checkout;
}
async function checkout() {
  if (busy) return;
  const f = readForm();
  busy = true; errorMsg = ""; build();
  try {
    const ok = new Set(extrasFor(f.intake.pkg, f.intake.flags.length > 0 || (f.intake.age !== null && f.intake.age < 18)).map(x => x.key));
    const sent = { follow: addons.follow, call: addons.call };
    EXTRAS.forEach(x => { sent[x.key] = addons[x.key] && ok.has(x.key); });
    const r = await api("/api/checkout", { method: "POST", body: JSON.stringify({ ...f, excluded: [...excluded], addons: sent, slot, tz: clientTZ }) });
    saveDraft();
    location.href = r.url;
  } catch (e) {
    busy = false; errorMsg = e.message;
    if (e.data && e.data.slotTaken) slot = null;
    build();
  }
}

/* ---------- booking calendar ---------- */
let calDay = null, calPick = null, SLOTS = [];
async function openCal() {
  $("cal").hidden = false; calPick = slot; calDay = null;
  $("calh").textContent = `Book your ${CFG.callMinutes}-minute call`;
  const dn = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const days = CFG.coachDays.slice().sort((a, b) => ((a + 1) % 7) - ((b + 1) % 7)).map(d => dn[d]);
  $("calnote").textContent = `Coaches take calls ${days.length === 7 ? "every day" : days.join(", ")}, starting between ${CFG.startHour}:00 and ${CFG.endHour}:00 ${CFG.coachTz.replace(/_/g, " ")} time. All times above are in your time zone.`;
  $("times").innerHTML = `<p class="note"><span class="spin"></span>Loading times…</p>`; $("dates").innerHTML = "";
  setTimeout(() => $("calclose").focus(), 0);
  try { SLOTS = await api("/api/slots"); } catch { SLOTS = []; }
  renderCal();
}
function closeCal(confirmed) {
  $("cal").hidden = true;
  if (confirmed) { slot = calPick; addons.call = true; errorMsg = ""; }
  else if (!slot) { const f = readForm().intake; if (!(f.flags.length || (f.age !== null && f.age < 18))) addons.call = false; }
  build();
}
function renderCal() {
  const groups = new Map();
  SLOTS.forEach(s => { const k = fmt(s.ts, clientTZ, { year: "numeric", month: "2-digit", day: "2-digit" }); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s); });
  const keys = [...groups.keys()];
  if (!keys.length) { $("times").innerHTML = `<p class="note">No call times are open right now. Please check back soon.</p>`; return; }
  if (!calDay || !groups.has(calDay)) calDay = calPick && SLOTS.some(s => s.ts === calPick) ? fmt(calPick, clientTZ, { year: "numeric", month: "2-digit", day: "2-digit" }) : keys.find(k => groups.get(k).some(s => !s.taken));
  if (!groups.has(calDay)) calDay = keys[0];
  $("dates").innerHTML = keys.map(k => {
    const ts = groups.get(k)[0].ts, free = groups.get(k).filter(s => !s.taken).length;
    return `<button type="button" class="dt" data-k="${k}" aria-pressed="${k === calDay}" ${free ? "" : "disabled"}><span>${fmt(ts, clientTZ, { weekday: "short" })}</span><b>${fmt(ts, clientTZ, { day: "numeric" })}</b><span>${fmt(ts, clientTZ, { month: "short" })}</span></button>`;
  }).join("");
  $("times").innerHTML = (groups.get(calDay) || []).map(s => `<button type="button" class="tm" data-ts="${s.ts}" aria-pressed="${s.ts === calPick}" ${s.taken ? "disabled" : ""}>${fmt(s.ts, clientTZ, { hour: "numeric", minute: "2-digit" })}${s.taken ? "<small>Booked</small>" : ""}</button>`).join("");
  $("dates").querySelectorAll(".dt").forEach(b => b.onclick = () => { calDay = b.dataset.k; renderCal(); });
  $("times").querySelectorAll(".tm").forEach(b => b.onclick = () => { calPick = +b.dataset.ts; renderCal(); });
  $("calsel").textContent = calPick ? `${slotText(calPick)} ${tzName(clientTZ)}` : "No time selected";
  $("calok").disabled = !calPick;
}
function initCal() {
  const list = [...new Set([userTZ, "Africa/Cairo", "Asia/Riyadh", "Asia/Dubai", "Asia/Kuwait", "Asia/Qatar", "Europe/London", "Europe/Berlin", "America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "Asia/Kolkata", "Australia/Sydney"])];
  $("tzsel").innerHTML = list.map(z => `<option value="${esc(z)}" ${z === clientTZ ? "selected" : ""}>${esc(z.replace(/_/g, " "))} (${esc(tzName(z))})${z === userTZ ? " · detected" : ""}</option>`).join("");
  $("tzsel").onchange = e => { clientTZ = e.target.value; calDay = null; renderCal(); build(); };
  $("calclose").onclick = () => closeCal(false);
  $("calcancel").onclick = () => closeCal(false);
  $("calok").onclick = () => closeCal(true);
  $("cal").addEventListener("click", e => { if (e.target.id === "cal") closeCal(false); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("cal").hidden) closeCal(false); });
}

/* ---------- events ---------- */
$("intake").addEventListener("submit", e => {
  e.preventDefault();
  const c = $("checkout"); if (c) c.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
});
$("intake").addEventListener("input", () => { errorMsg = ""; build(); });
$("intake").addEventListener("change", e => {
  if (e.target.name === "reg") { excluded.clear(); loadFoods(); return; }
  if (e.target.id === "wasame" && !e.target.checked) $("wa").value = "";
  build();
});

/* ---------- start ---------- */
// home page: team cards and the latest articles
async function loadTeamAndBlog() {
  if (!window.BLOG) return;
  try { const t = await api("/api/team"); if ($("teamlist")) $("teamlist").innerHTML = BLOG.teamHTML(t); } catch {}
  try { const p = await api("/api/blog?limit=3"); if ($("bloglist")) $("bloglist").innerHTML = BLOG.listHTML(p, { href: window.BLOG_HREF }); } catch {}
}

(async function init() {
  if (!loadDraft()) {
    $(/^Africa\/Cairo$/.test(userTZ) ? "reg-eg" : "reg-intl").checked = true;
    if (/^ar\b/i.test(navigator.language || "")) $("lang-ar").checked = true;
  }
  initCal();
  loadTeamAndBlog();
  try { CFG = await api("/api/config"); } catch { CFG = null; }
  if (!CFG) { $("out").innerHTML = `<div class="err">We couldn't load prices. Please refresh the page.</div>`; return; }
  paintPrices();
  route();
  await loadFoods();
  if (new URLSearchParams(location.search).get("payment") === "unknown" && !$("appwrap").hidden) { errorMsg = "We couldn't confirm that payment. If you were charged, check your email for your plan link or contact us."; build(); }
})();
})();
