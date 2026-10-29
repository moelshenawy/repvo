// Orders, bookings, follow-up subscriptions and the emails around them.
const crypto = require("node:crypto");
const config = require("./config");
const { db, getSetting, listFoods, logEvent, tx } = require("./db");
const E = require("./engine");
const { supplementsGuide } = require("./supps");
const { cardioPlan } = require("./cardio");
const { AR_DAYS } = require("./ar");
const T = require("./time");
const pay = require("./payments");
const mail = require("./mail");

const HOLD_MS = 30 * 60 * 1000;          // a call slot is held while the client pays
const PENDING_EXPIRY_MS = 3 * 3600 * 1000;
const RENEWAL_GRACE_MS = 7 * 86400 * 1000;

const rid = n => crypto.randomBytes(n).toString("base64url");
const newOrderId = () => "RV-" + Date.now().toString(36).toUpperCase() + "-" + crypto.randomBytes(3).toString("hex").toUpperCase();
const money = n => "$" + Number(n).toFixed(2).replace(/\.00$/, "");
const J = s => (s ? JSON.parse(s) : null);

/* ---------- contact ---------- */
const okEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 200;
const okPhone = p => /^\+?[\d\s().-]+$/.test(p) && p.replace(/\D/g, "").length >= 8 && p.replace(/\D/g, "").length <= 15;

/* ---------- call slots ---------- */
function takenSet(now = Date.now()) {
  return new Set(db.prepare("SELECT ts FROM bookings WHERE status IN ('confirmed','done') OR (status='held' AND hold_until>?)").all(now).map(r => r.ts));
}
function allSlots(now = Date.now()) {
  const a = getSetting("availability");
  const p = T.parts(now, a.tz);
  const taken = takenSet(now);
  const out = [];
  for (let i = 0; i <= a.horizonDays; i++) {
    const dt = new Date(Date.UTC(p.y, p.m, p.d + i));
    if (!a.days.includes(dt.getUTCDay())) continue;
    for (let h = a.startHour; h <= a.endHour; h++) {
      const ts = T.wallToUtc(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(), h, 0, a.tz);
      if (ts < now + a.minNoticeHours * 3600e3) continue;
      out.push({ ts, taken: taken.has(ts) });
    }
  }
  return out;
}

/* ---------- pricing ---------- */
/* ---------- add-ons ---------- */
const FEATURES = {
  train_log: { label: "Training tracker", needs: "workout" },
  food_log: { label: "Nutrition tracker", needs: "nutrition" },
  videos: { label: "Exercise videos", needs: "workout" },
  recipes: { label: "Healthy recipes", needs: "nutrition" },
  supplements: { label: "Supplements guide", needs: "any" },
  cardio: { label: "Cardio plan", needs: "any" },
};
const pkgHas = (pkg, part) => part === "any" || pkg === "both" || pkg === part;
const COACHING = { follow: "Coach follow-up: weekly check-in + weekly call (first month)" };
/** Add-ons this client can buy for their package. */
function availableFeatures(pkg, flagged) {
  if (flagged) return [];
  const videosOn = getSetting("videos").offer;
  return Object.keys(FEATURES).filter(k => pkgHas(pkg, FEATURES[k].needs) && (k !== "videos" || videosOn));
}

function quote({ pkg, flagged, coaching, call, features = [] }) {
  const pr = getSetting("prices");
  const lines = [];
  if (!flagged) lines.push({ key: "pkg", label: E.PKGNAME[pkg], usd: pr[pkg] });
  for (const k of features) lines.push({ key: k, label: FEATURES[k].label, usd: pr[k] });
  if (coaching) lines.push({ key: coaching, label: COACHING[coaching], usd: pr[coaching], recurring: true });
  if (call) lines.push({ key: "call", label: `${getSetting("availability").callMinutes}-minute coach call`, usd: pr.call });
  const total = Math.round(lines.reduce((a, l) => a + l.usd, 0) * 100) / 100;
  return { lines, total };
}
function chargeFor(totalUsd) {
  if (config.paymentProvider === "paymob" && config.paymob.currency !== "USD") {
    const rate = getSetting("fx").usdToEgp;
    return { amount: Math.round(totalUsd * rate * 100), currency: config.paymob.currency, rate };
  }
  return { amount: Math.round(totalUsd * 100), currency: "USD", rate: 1 };
}

/* ---------- checkout ---------- */
async function checkout(body) {
  const { intake, error } = E.parseIntake(body.intake);
  if (error) return { error };
  const c = body.contact || {};
  const contact = { name: String(c.name || "").trim().slice(0, 100), email: String(c.email || "").trim().toLowerCase(), phone: String(c.phone || "").trim(), wa: String(c.wa || c.phone || "").trim() };
  if (contact.name.length < 2) return { error: "Please enter your name." };
  if (!okEmail(contact.email)) return { error: "Please enter a valid email." };
  if (!okPhone(contact.phone)) return { error: "Please enter a phone number with country code." };
  if (!okPhone(contact.wa)) return { error: "Please enter a WhatsApp number with country code." };

  const foods = listFoods();
  const ids = new Set(foods.map(f => f.id));
  const excluded = (Array.isArray(body.excluded) ? body.excluded : []).map(String).filter(id => ids.has(id));
  const flagged = E.isFlagged(intake);
  const coaching = body.addons?.follow ? "follow" : null;
  const follow = !!coaching;
  const call = flagged || !!body.addons?.call;
  const avail = availableFeatures(intake.pkg, flagged);
  const features = Object.keys(FEATURES).filter(k => body.addons?.[k] && avail.includes(k));

  if (!flagged && intake.pkg !== "workout") {
    const gaps = E.proteinGaps(E.eligibleFoods(foods, intake.region, excluded), intake.meals);
    if (gaps.length) return { error: `${gaps.join(" and ")} has no protein option left. Keep at least one protein food.` };
  }
  let slot = null;
  if (call) {
    slot = Number(body.slot);
    if (!allSlots().some(s => s.ts === slot && !s.taken)) return { error: "That call time is no longer available. Please choose another.", slotTaken: true };
  }
  const { lines, total } = quote({ pkg: intake.pkg, flagged, coaching, call, features });
  if (total <= 0) return { error: "Nothing to pay for." };

  const provider = pay.active();
  const missing = provider.ready();
  if (missing.length) { console.error("Payment provider not configured:", missing.join(", ")); return { error: "Payments are not set up yet. Please try again later." }; }

  const charge = chargeFor(total);
  const order = {
    id: newOrderId(), token: rid(24), kind: "plan", created_at: Date.now(), status: "pending", provider: provider.name,
    ...contact, region: intake.region, pkg: intake.pkg, flagged: flagged ? 1 : 0, flags: JSON.stringify(E.flagReasons(intake)),
    follow: follow ? 1 : 0, coaching, lang: intake.lang, call_ts: slot, intake: JSON.stringify(intake), excluded: JSON.stringify(excluded), features: JSON.stringify(features),
    lines: JSON.stringify(lines), total_usd: total, charge_amount: charge.amount, charge_currency: charge.currency,
    client_tz: T.validTz(body.tz) ? body.tz : getSetting("availability").tz,
  };
  try {
    tx(() => {
      if (slot && takenSet().has(slot)) throw Object.assign(new Error("slot"), { slotTaken: true });
      const cols = Object.keys(order);
      db.prepare(`INSERT INTO orders(${cols.join(",")}) VALUES(${cols.map(() => "?").join(",")})`).run(...cols.map(k => order[k]));
      if (slot) db.prepare("INSERT INTO bookings(order_id,ts,status,hold_until) VALUES(?,?,?,?)").run(order.id, slot, "held", Date.now() + HOLD_MS);
    });
  } catch (e) {
    if (e.slotTaken) return { error: "That call time was just taken. Please choose another.", slotTaken: true };
    throw e;
  }
  logEvent(order.id, "created", { total, provider: provider.name });
  try {
    const s = await provider.create(order, lines);
    db.prepare("UPDATE orders SET provider_ref=? WHERE id=?").run(s.ref, order.id);
    return { url: s.url, token: order.token, orderId: order.id };
  } catch (e) {
    console.error("[checkout] gateway error", e);
    db.prepare("UPDATE orders SET status='failed' WHERE id=?").run(order.id);
    db.prepare("UPDATE bookings SET status='cancelled' WHERE order_id=? AND status='held'").run(order.id);
    logEvent(order.id, "gateway_error", { message: String(e.message || e) });
    return { error: "We couldn't open the payment page. Please try again in a minute." };
  }
}

/** Re-open payment for a pending order (used by renewal links and retries). */
async function payLink(token) {
  const o = db.prepare("SELECT * FROM orders WHERE token=?").get(token);
  if (!o) return { error: "not_found" };
  if (o.status === "paid") return { paid: true, order: o };
  if (o.kind === "plan" && (o.status !== "pending" || Date.now() - o.created_at > PENDING_EXPIRY_MS)) return { error: "expired" };
  if (o.kind === "addon" && o.status !== "pending") return { error: "expired" };
  if (o.kind === "renewal") {
    const s = db.prepare("SELECT status FROM subscriptions WHERE id=?").get(o.sub_id);
    if (o.status !== "pending" || !s || s.status === "cancelled") return { error: "expired" };
  }
  if (o.call_ts) {
    // extend the hold while they retry, if the slot is still theirs
    const ok = tx(() => {
      const other = db.prepare("SELECT 1 FROM bookings WHERE ts=? AND order_id<>? AND (status IN ('confirmed','done') OR (status='held' AND hold_until>?))").get(o.call_ts, o.id, Date.now());
      if (other) return false;
      db.prepare("UPDATE bookings SET status='held', hold_until=? WHERE order_id=? AND status IN ('held','cancelled')").run(Date.now() + HOLD_MS, o.id);
      return true;
    });
    if (!ok) return { error: "slot_taken" };
  }
  const provider = pay.providers[o.provider];
  const s = await provider.create(o, J(o.lines));
  return { url: s.url };
}

/* ---------- payment confirmed ---------- */
function confirmCall(o) {
  const clash = db.prepare("SELECT 1 FROM bookings WHERE ts=? AND order_id<>? AND status IN ('confirmed','done')").get(o.call_ts, o.id);
  const b = db.prepare("SELECT id FROM bookings WHERE order_id=? ORDER BY id DESC").get(o.id);
  if (b) db.prepare("UPDATE bookings SET status='confirmed', hold_until=NULL, note=? WHERE id=?").run(clash ? "Double-booked: payment arrived after the hold expired. Reschedule with the client." : null, b.id);
  else db.prepare("INSERT INTO bookings(order_id,ts,status,note) VALUES(?,?,?,?)").run(o.id, o.call_ts, "confirmed", clash ? "Double-booked: reschedule with the client." : null);
  return !!clash;
}
/** Starts the monthly coach follow-up. It always belongs to the plan (planId), even when bought later. */
function startFollow(o, planId, now, extra) {
  const anchor = new Date(now).getUTCDate();
  const tier = o.coaching || "follow";
  const sub = { id: "SUB-" + rid(6), order_id: planId, created_at: now, status: "active", provider: o.provider, provider_sub_id: extra.stripeSub || null, tier,
    name: o.name, email: o.email, phone: o.phone, wa: o.wa, price_usd: J(o.lines).find(l => l.key === tier).usd, anchor_day: anchor, next_charge_at: T.addMonth(now, anchor) };
  const cols = Object.keys(sub);
  db.prepare(`INSERT INTO subscriptions(${cols.join(",")}) VALUES(${cols.map(() => "?").join(",")})`).run(...cols.map(k => sub[k]));
  return sub;
}
async function markPaid(orderId, ref, extra = {}) {
  const now = Date.now();
  const res = tx(() => {
    const o = db.prepare("SELECT * FROM orders WHERE id=?").get(orderId);
    if (!o) return { missing: true };
    if (o.status === "paid") return { already: true };
    db.prepare("UPDATE orders SET status='paid', paid_at=?, provider_ref=COALESCE(?,provider_ref) WHERE id=?").run(now, ref || null, o.id);
    const out = { order: { ...o, status: "paid", paid_at: now } };
    if (o.kind === "plan") {
      const intake = J(o.intake);
      if (!o.flagged && o.pkg !== "workout") {
        const foods = E.eligibleFoods(listFoods(), o.region, J(o.excluded));
        db.prepare("UPDATE orders SET plan_foods=?, picks=? WHERE id=?").run(JSON.stringify(foods), JSON.stringify(E.defaultPicks(intake.meals)), o.id);
      }
      if (o.call_ts) out.clash = confirmCall(o);
      if (o.follow) out.sub = startFollow(o, o.id, now, extra);
    } else if (o.kind === "addon") {
      const parent = db.prepare("SELECT id, features FROM orders WHERE id=?").get(o.parent_id);
      if (parent) {
        const f = new Set([...(J(parent.features) || []), ...(J(o.features) || [])]);
        db.prepare("UPDATE orders SET features=? WHERE id=?").run(JSON.stringify([...f]), parent.id);
        out.parent = parent.id;
        if (o.follow) {
          // a cancelled follow-up on this plan is replaced by the new one
          db.prepare("DELETE FROM subscriptions WHERE order_id=? AND status='cancelled'").run(parent.id);
          db.prepare("UPDATE orders SET follow=1, coaching='follow' WHERE id=?").run(parent.id);
          out.sub = startFollow(o, parent.id, now, extra);
        }
      }
      if (o.call_ts) out.clash = confirmCall(o);
    } else if (o.kind === "renewal") {
      const s = db.prepare("SELECT * FROM subscriptions WHERE id=?").get(o.sub_id);
      if (s) {
        const next = T.addMonth(s.next_charge_at, s.anchor_day);
        db.prepare("UPDATE subscriptions SET status='active', next_charge_at=?, pending_order_id=NULL WHERE id=?").run(next, s.id);
        out.sub = { ...s, next_charge_at: next };
      }
    }
    return out;
  });
  if (res.missing || res.already) return res;
  logEvent(orderId, "paid", { ref });
  sendPaidEmails(res).catch(e => console.error("[mail]", e));
  return res;
}

function markFailed(orderId, ref) {
  const o = db.prepare("SELECT status FROM orders WHERE id=?").get(orderId);
  if (o && o.status === "pending") logEvent(orderId, "payment_failed", { ref });
}

/* ---------- emails ---------- */
const coachTz = () => getSetting("availability").tz;
const when = (ts, tz) => `${T.fmt(ts, tz, { weekday: "long", day: "numeric", month: "long" })}, ${T.fmt(ts, tz, { hour: "numeric", minute: "2-digit", timeZoneName: "short" })}`;

const isAr = o => o.lang === "ar" || (J(o.intake) || {}).lang === "ar";
const whenAr = (ts, tz) => `${new Intl.DateTimeFormat("ar-EG-u-nu-latn", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(new Date(ts))}، ${new Intl.DateTimeFormat("ar-EG-u-nu-latn", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(ts))}`;

async function sendPaidEmails({ order: o, sub, clash }) {
  const { esc, layout, button, send } = mail;
  const ar = isAr(o);
  const lines = J(o.lines);
  const receipt = `<table style="width:100%;border-collapse:collapse;font-size:14px">${lines.map(l => `<tr><td style="padding:6px 0;border-bottom:1px solid #eee">${esc(l.label)}</td><td style="padding:6px 0;border-bottom:1px solid #eee;text-align:${ar ? "left" : "right"}">${money(l.usd)}</td></tr>`).join("")}
    <tr><td style="padding:8px 0;font-weight:700">${ar ? "الإجمالي" : "Total"}</td><td style="padding:8px 0;text-align:${ar ? "left" : "right"};font-weight:700">${money(o.total_usd)}</td></tr></table>`;
  const planUrl = `${config.baseUrl}/plan/${o.token}`;
  const adminUrl = `${config.baseUrl}/admin#order=${o.id}`;

  if (o.kind === "addon") {
    const parent = db.prepare("SELECT id, token FROM orders WHERE id=?").get(o.parent_id);
    const pUrl = parent ? `${config.baseUrl}/plan/${parent.token}` : null;
    const extraP = o.call_ts ? (ar ? `<p><b>مكالمتك:</b> ${esc(whenAr(o.call_ts, o.client_tz))}. الكوتش هيكلمك على واتساب على ${esc(o.wa)}.</p>`
        : `<p><b>Your call:</b> ${esc(when(o.call_ts, o.client_tz))}. A coach will call you on WhatsApp at ${esc(o.wa)}.</p>`)
      : sub ? (ar ? `<p><b>المتابعة مع الكوتش مفعّلة.</b> احجز مكالمتك الأسبوعية من تبويب الكوتش في خطتك. التجديد شهريًا يوم ${sub.anchor_day}.</p>`
        : `<p><b>Coach follow-up is active.</b> Book your weekly call from the Coach tab in your plan. It renews monthly on the ${T.ordinal(sub.anchor_day)}.</p>`) : "";
    await send(o.email, ar ? "تمت الإضافة لخطتك في Repvo" : "Added to your Repvo plan", layout(ar ? "تمت الإضافة لخطتك" : "Added to your plan",
      `<p>${ar ? `شكرًا يا ${esc(o.name)}. الإضافة موجودة في صفحة خطتك دلوقتي.` : `Thanks, ${esc(o.name)}. It's on your plan page now.`}</p>${extraP}${receipt}${pUrl ? button(pUrl, ar ? "افتح خطتي" : "Open my plan") : ""}`, ar));
    if (config.mail.coachEmail && (o.call_ts || sub)) {
      const what = o.call_ts ? `booked a coach call for <b>${esc(when(o.call_ts, coachTz()))}</b>${clash ? ` <b style="color:#C0392B">Double-booked: reschedule.</b>` : ""}` : `started coach follow-up (${money(sub.price_usd)}/month)`;
      await send(config.mail.coachEmail, `${o.call_ts ? "Coach call booked" : "Follow-up started"}: ${o.name}`, layout(o.call_ts ? "Coach call booked" : "Follow-up started",
        `<p>${esc(o.name)} (${esc(o.email)}, WhatsApp ${esc(o.wa)}) ${what} from their account.</p>${parent ? button(`${config.baseUrl}/admin#order=${parent.id}`, "Open their plan in admin") : ""}`));
    }
    return;
  }
  if (o.kind === "renewal") {
    await send(o.email, ar ? "تم تجديد المتابعة" : "Coach follow-up renewed", layout(ar ? "تم تجديد المتابعة مع الكوتش" : "Your coach follow-up is renewed",
      `<p>${ar ? `شكرًا يا ${esc(o.name)}. الكوتش مكمّل معاك شهر كمان.` : `Thanks, ${esc(o.name)}. Your coach keeps working with you for another month.`}</p>${receipt}
       <p>${ar ? "التجديد الجاي:" : "Next renewal:"} <b>${esc(T.fmt(sub.next_charge_at, o.client_tz, { day: "numeric", month: "long", year: "numeric" }))}</b>.</p>`, ar));
    if (config.mail.coachEmail) await send(config.mail.coachEmail, `Follow-up renewed: ${o.name}`, layout("Follow-up renewed", `<p>${esc(o.name)} (${esc(o.email)}, WhatsApp ${esc(o.wa)}) paid ${money(o.total_usd)} for another month.</p>`));
    return;
  }
  const callP = o.call_ts ? (ar
    ? `<p><b>مكالمتك:</b> ${esc(whenAr(o.call_ts, o.client_tz))}. الكوتش هيكلمك على واتساب على ${esc(o.wa)}.</p>`
    : `<p><b>Your call:</b> ${esc(when(o.call_ts, o.client_tz))}. A coach will call you on WhatsApp at ${esc(o.wa)}.</p>`) : "";
  const followP = sub ? (ar
    ? `<p><b>المتابعة مع الكوتش مفعّلة.</b> الكوتش هيتابع معاك كل أسبوع على واتساب، ومن صفحة خطتك تقدر تحجز مكالمة كل أسبوع. التجديد شهريًا يوم ${sub.anchor_day}${o.provider === "stripe" ? " ويتخصم من الكارت تلقائيًا" : " وهنبعتلك لينك الدفع في اليوم ده"}.</p>`
    : `<p><b>Coach follow-up is active.</b> Your coach checks in with you every week on WhatsApp, and you can book one call each week from your plan page. It renews monthly on the ${T.ordinal(sub.anchor_day)}${sub.anchor_day > 28 ? " (or the last day of shorter months)" : ""}; ${o.provider === "stripe" ? "your card is charged automatically" : "we email you a payment link on that day"}.</p>`) : "";
  const body = o.flagged
    ? (ar ? `<p>أهلًا ${esc(o.name)}، شكرًا لطلبك. بسبب المعلومات الصحية اللي شاركتها، الكوتش هيعمل خطتك معاك في المكالمة بدل ما تتعمل أوتوماتيك.</p>${callP}${followP}${receipt}${button(planUrl, "شوف طلبك")}`
          : `<p>Hi ${esc(o.name)}, thanks for your order. Because of the health details you shared, a coach will build your plan with you on the call instead of generating it automatically.</p>${callP}${followP}${receipt}${button(planUrl, "View your order")}`)
    : (ar ? `<p>أهلًا ${esc(o.name)}، خطتك جاهزة. افتحها في أي وقت من اللينك ده واحتفظ بالإيميل عشان ترجعلها.</p>${button(planUrl, "افتح خطتي")}${callP}${followP}${receipt}`
          : `<p>Hi ${esc(o.name)}, your plan is ready. Open it any time from the link below and keep this email so you can come back to it.</p>${button(planUrl, "Open my plan")}${callP}${followP}${receipt}`);
  const subj = ar ? (o.flagged ? "تم حجز مكالمتك مع كوتش Repvo" : "خطتك من Repvo جاهزة") : (o.flagged ? "Your Repvo coach call is booked" : "Your Repvo plan is ready");
  await send(o.email, subj, layout(ar ? (o.flagged ? "تم حجز مكالمتك" : "خطتك جاهزة") : (o.flagged ? "Your coach call is booked" : "Your plan is ready"), body, ar));

  if (config.mail.coachEmail) {
    const intake = J(o.intake);
    const flags = J(o.flags) || [];
    const feats = J(o.features) || [];
    await send(config.mail.coachEmail, `${o.flagged ? "⚠ Coach review · " : ""}New order ${o.id} · ${money(o.total_usd)}`, layout(`New order ${o.id}`,
      `<p><b>${esc(o.name)}</b> · ${esc(o.email)} · Phone ${esc(o.phone)} · WhatsApp ${esc(o.wa)}</p>
       <p>${esc(E.PKGNAME[o.pkg])} · ${esc(intake.goal)} · ${intake.sex === "m" ? "Male" : "Female"}, ${intake.age} y, ${intake.wt} kg, ${intake.ht} cm · ${o.region === "eg" ? "Egypt" : "Outside Egypt"} · program in ${intake.lang === "ar" ? "Arabic" : "English"}</p>
       ${feats.length ? `<p><b>Add-ons:</b> ${feats.map(k => esc(FEATURES[k]?.label || k)).join(", ")}</p>` : ""}
       ${(intake.injuries || []).length ? `<p style="color:#B7791F"><b>Pain / injury:</b> ${intake.injuries.map(k => esc(E.AREAS.en[k])).join(", ")}. Exercises that load these areas were swapped or left out.</p>` : ""}
       ${intake.medNotes ? `<p><b>Medical notes:</b> ${esc(intake.medNotes)}</p>` : ""}
       ${flags.length ? `<p style="color:#B7791F"><b>Health flags:</b> ${flags.map(esc).join("; ")}. No plan was generated; build it with the client on the call.</p>` : ""}
       ${o.call_ts ? `<p><b>Call:</b> ${esc(when(o.call_ts, coachTz()))}${clash ? ` <b style="color:#C0392B">Double-booked: reschedule.</b>` : ""}</p>` : ""}
       ${sub ? `<p><b>Follow-up:</b> active, ${money(sub.price_usd)}/month, weekly check-in + weekly call.</p>` : ""}${receipt}${button(adminUrl, "Open in admin")}`));
  }
}

/* ---------- weekly calls (coach follow-up) ---------- */
// One call per coaching week. Weeks start on Saturday in the coach's time zone.
function weekKey(ts) {
  const p = T.parts(ts, coachTz());
  return Math.floor((Date.UTC(p.y, p.m, p.d) / 86400000 - 2) / 7);
}
function weeklyState(token) {
  const o = db.prepare("SELECT * FROM orders WHERE token=? AND kind='plan' AND status='paid'").get(token);
  if (!o) return null;
  const sub = db.prepare("SELECT * FROM subscriptions WHERE order_id=?").get(o.id);
  if (!sub) return null;
  const booked = db.prepare("SELECT id, ts, status FROM bookings WHERE order_id=? AND kind='weekly' AND status<>'cancelled' ORDER BY ts").all(o.id);
  return { o, sub, booked, active: sub.status === "active", until: sub.next_charge_at };
}
function weeklyView(token) {
  const st = weeklyState(token); if (!st) return null;
  const used = new Set(st.booked.map(b => weekKey(b.ts)));
  const slots = st.active ? allSlots().filter(x => x.ts < st.until).map(x => ({ ts: x.ts, taken: x.taken, weekUsed: used.has(weekKey(x.ts)) })) : [];
  return { active: st.active, until: st.until, minutes: getSetting("availability").callMinutes, coachTz: coachTz(),
    booked: st.booked.map(b => ({ id: b.id, ts: b.ts, status: b.status, canCancel: b.status === "confirmed" && b.ts - Date.now() > 24 * 3600e3 })), slots };
}
async function bookWeekly(token, slot) {
  const st = weeklyState(token); if (!st) return { error: "Coach follow-up not found." };
  if (!st.active) return { error: "Your follow-up isn't active. Renew it to book calls." };
  const ts = Number(slot);
  if (!(ts < st.until)) return { error: "That week is after your current month. Book it after you renew." };
  if (!allSlots().some(x => x.ts === ts && !x.taken)) return { error: "That time is no longer available. Please choose another." };
  if (st.booked.some(b => weekKey(b.ts) === weekKey(ts))) return { error: "You already have a call booked that week." };
  const ok = tx(() => {
    if (takenSet().has(ts)) return false;
    db.prepare("INSERT INTO bookings(order_id,ts,status,kind,note) VALUES(?,?,?,?,?)").run(st.o.id, ts, "confirmed", "weekly", "Weekly follow-up call");
    return true;
  });
  if (!ok) return { error: "That time was just taken. Please choose another." };
  logEvent(st.o.id, "weekly_call_booked", { ts });
  const o = st.o, ar = isAr(o);
  mail.send(o.email, ar ? "تم حجز مكالمتك الأسبوعية" : "Your weekly call is booked", mail.layout(ar ? "تم حجز مكالمتك الأسبوعية" : "Your weekly call is booked",
    ar ? `<p>مكالمتك مع الكوتش: <b>${mail.esc(whenAr(ts, o.client_tz))}</b>. هيكلمك على واتساب على ${mail.esc(o.wa)}.</p>` : `<p>Your call with your coach: <b>${mail.esc(when(ts, o.client_tz))}</b>. They'll call you on WhatsApp at ${mail.esc(o.wa)}.</p>`, ar)).catch(e => console.error("[mail]", e));
  if (config.mail.coachEmail) mail.send(config.mail.coachEmail, `Weekly call booked: ${o.name}`, mail.layout("Weekly call booked",
    `<p>${mail.esc(o.name)} (WhatsApp ${mail.esc(o.wa)}) booked their weekly call for <b>${mail.esc(when(ts, coachTz()))}</b>.</p>${mail.button(`${config.baseUrl}/admin#order=${o.id}`, "Open in admin")}`)).catch(e => console.error("[mail]", e));
  return { ok: true };
}
function cancelWeekly(token, id) {
  const st = weeklyState(token); if (!st) return { error: "Not found." };
  const b = st.booked.find(x => x.id === Number(id));
  if (!b || b.status !== "confirmed") return { error: "Call not found." };
  if (b.ts - Date.now() <= 24 * 3600e3) return { error: "Calls can be cancelled up to 24 hours before. Message your coach on WhatsApp." };
  db.prepare("UPDATE bookings SET status='cancelled' WHERE id=?").run(b.id);
  logEvent(st.o.id, "weekly_call_cancelled", { ts: b.ts });
  return { ok: true };
}

/* ---------- what a client can add after buying ---------- */
/** Add-ons, coach follow-up and coach calls this paid plan can still get. */
function upgradesFor(o) {
  if (!o || o.kind !== "plan" || o.status !== "paid") return [];
  const has = J(o.features) || [];
  const pr = getSetting("prices");
  const out = availableFeatures(o.pkg, o.flagged).filter(k => !has.includes(k)).map(k => ({ key: k, label: FEATURES[k].label, usd: pr[k] }));
  const sub = db.prepare("SELECT status FROM subscriptions WHERE order_id=?").get(o.id);
  const pendingFollow = db.prepare("SELECT 1 FROM orders WHERE parent_id=? AND kind='addon' AND follow=1 AND status='paid'").get(o.id);
  if ((!sub || sub.status === "cancelled") && !pendingFollow) out.push({ key: "follow", label: COACHING.follow, usd: pr.follow, recurring: true });
  out.push({ key: "call", label: `${getSetting("availability").callMinutes}-minute coach call`, usd: pr.call, slot: true });
  return out;
}
const upgradesForToken = token => upgradesFor(db.prepare("SELECT * FROM orders WHERE token=?").get(token));
/** Coach calls bought after the plan. */
function extraCalls(planId) {
  const min = getSetting("availability").callMinutes;
  return db.prepare("SELECT a.call_ts ts, b.status FROM orders a JOIN bookings b ON b.order_id=a.id WHERE a.parent_id=? AND a.kind='addon' AND a.status='paid' AND a.call_ts IS NOT NULL ORDER BY a.call_ts")
    .all(planId).map(c => ({ ts: c.ts, status: c.status, minutes: min }));
}

/* ---------- client plan view ---------- */
function orderView(token) {
  const o = db.prepare("SELECT * FROM orders WHERE token=?").get(token);
  if (!o) return null;
  const intake = J(o.intake);
  const v = { id: o.id, kind: o.kind, status: o.status, name: o.name, pkg: o.pkg, pkgName: E.PKGNAME[o.pkg], flagged: !!o.flagged,
    flags: J(o.flags) || [], lines: J(o.lines), total: o.total_usd, charge: { amount: o.charge_amount, currency: o.charge_currency }, paidAt: o.paid_at,
    createdAt: o.created_at, contact: { email: o.email, phone: o.phone, wa: o.wa }, clientTz: o.client_tz, coachTz: coachTz(),
    expired: o.status === "pending" && o.kind === "plan" && Date.now() - o.created_at > PENDING_EXPIRY_MS };
  if (o.call_ts) {
    const b = db.prepare("SELECT status FROM bookings WHERE order_id=? ORDER BY id DESC").get(o.id);
    v.call = { ts: o.call_ts, status: b?.status || "held", minutes: getSetting("availability").callMinutes };
  }
  const s = db.prepare("SELECT status,next_charge_at,anchor_day,price_usd,provider,tier FROM subscriptions WHERE order_id=?").get(o.id);
  if (s) v.follow = s;
  v.lang = (intake || {}).lang || o.lang || "en";
  if (o.kind === "addon") {
    const parent = db.prepare("SELECT token FROM orders WHERE id=?").get(o.parent_id);
    v.parentToken = parent?.token;
    return v;
  }
  if (o.kind === "plan") {
    const has = J(o.features) || [];
    const pr = getSetting("prices");
    v.features = has;
    v.upgrades = upgradesFor(o);
    v.calls = extraCalls(o.id);
  }
  if (o.status === "paid" && o.kind === "plan" && !o.flagged) {
    const has = v.features;
    if (has.includes("cardio")) {
      v.cardio = cardioPlan(intake, E.SPLIT[intake.days], intake.lang);
      if (intake.lang === "ar") v.cardio.week.forEach(w => { w.lift = AR_DAYS[w.lift] || w.lift; });
    }
    if (has.includes("supplements")) v.supplements = supplementsGuide(intake, intake.pkg !== "workout" ? E.targets(intake) : E.targets(intake), J(o.plan_foods) || [], intake.lang);
    v.plan = E.buildPlan(intake, J(o.plan_foods) || [], J(o.picks) || E.defaultPicks(intake.meals),
      { recipes: has.includes("recipes"), videos: has.includes("videos") ? getSetting("videos").urls || {} : null });
  }
  return v;
}
function swap(token, meal, role) {
  const o = db.prepare("SELECT id,status,picks,intake,flagged FROM orders WHERE token=?").get(token);
  if (!o || o.status !== "paid" || o.flagged || !o.picks) return false;
  const picks = J(o.picks);
  if (!picks[meal] || !["protein", "carb", "fat", "veg"].includes(role)) return false;
  picks[meal][role] = (picks[meal][role] || 0) + 1;
  db.prepare("UPDATE orders SET picks=? WHERE id=?").run(JSON.stringify(picks), o.id);
  return true;
}

/* ---------- buying an add-on after the plan ---------- */
async function buyAddon(token, feature, slotIn) {
  const o = db.prepare("SELECT * FROM orders WHERE token=? AND kind='plan'").get(token);
  if (!o || o.status !== "paid") return { error: "Plan not found." };
  const up = upgradesFor(o).find(u => u.key === feature);
  if (!up) return feature === "follow" ? { error: "Coach follow-up is already active on this plan." }
    : (J(o.features) || []).includes(feature) ? { error: "You already have this." } : { error: "That add-on isn't available for this plan." };
  let slot = null;
  if (feature === "call") {
    slot = Number(slotIn);
    if (!allSlots().some(s => s.ts === slot && !s.taken)) return { error: "That call time is no longer available. Please choose another.", slotTaken: true };
  }
  const provider = pay.active();
  if (provider.ready().length) return { error: "Payments are not set up yet. Please try again later." };
  const usd = up.usd;
  const charge = chargeFor(usd);
  const line = { key: feature, label: up.label, usd, ...(up.recurring ? { recurring: true } : {}) };
  const a = { id: newOrderId(), token: rid(24), kind: "addon", parent_id: o.id, created_at: Date.now(), status: "pending", provider: provider.name,
    name: o.name, email: o.email, phone: o.phone, wa: o.wa, region: o.region, pkg: o.pkg, client_tz: o.client_tz, lang: J(o.intake)?.lang || o.lang || "en",
    features: JSON.stringify(FEATURES[feature] ? [feature] : []), lines: JSON.stringify([line]), total_usd: usd,
    follow: feature === "follow" ? 1 : 0, coaching: feature === "follow" ? "follow" : null, call_ts: slot,
    charge_amount: charge.amount, charge_currency: charge.currency };
  const cols = Object.keys(a);
  try {
    tx(() => {
      if (slot && takenSet().has(slot)) throw Object.assign(new Error("slot"), { slotTaken: true });
      db.prepare(`INSERT INTO orders(${cols.join(",")}) VALUES(${cols.map(() => "?").join(",")})`).run(...cols.map(k => a[k]));
      if (slot) db.prepare("INSERT INTO bookings(order_id,ts,status,hold_until) VALUES(?,?,?,?)").run(a.id, slot, "held", Date.now() + HOLD_MS);
    });
  } catch (e) {
    if (e.slotTaken) return { error: "That call time was just taken. Please choose another.", slotTaken: true };
    throw e;
  }
  logEvent(a.id, "addon_created", { feature, parent: o.id });
  try {
    const s = await provider.create(a, J(a.lines));
    db.prepare("UPDATE orders SET provider_ref=? WHERE id=?").run(s.ref, a.id);
    return { url: s.url };
  } catch (e) {
    console.error("[addon] gateway error", e);
    db.prepare("UPDATE orders SET status='failed' WHERE id=?").run(a.id);
    db.prepare("UPDATE bookings SET status='cancelled' WHERE order_id=? AND status='held'").run(a.id);
    return { error: "We couldn't open the payment page. Please try again in a minute." };
  }
}
/** Where a client lands after paying: add-ons go back to their plan. */
function landingToken(o) {
  if (o.kind === "addon" && o.parent_id) return db.prepare("SELECT token FROM orders WHERE id=?").get(o.parent_id)?.token || o.token;
  return o.token;
}

/* ---------- trackers ---------- */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const num = (v, lo, hi) => { const n = Number(v); return isFinite(n) && n >= lo && n <= hi ? n : null; };
function trackerOrder(token, feature) {
  const o = db.prepare("SELECT * FROM orders WHERE token=? AND kind='plan' AND status='paid'").get(token);
  if (!o || !(J(o.features) || []).includes(feature)) return null;
  return o;
}
function trainGet(token) {
  const o = trackerOrder(token, "train_log"); if (!o) return null;
  const intake = J(o.intake);
  const lang = intake.lang;
  const built = E.buildPlan({ ...intake, pkg: "workout" }, [], [], { lang }).training;
  const days = built.map(d => ({ n: d.n, name: d.name, rows: d.rows.map(r => ({ key: r.key, ex: r.ex, txt: r.txt, sets: parseInt(r.txt, 10) || 3 })) }));
  const sessions = db.prepare("SELECT id, date, day_n, data, note FROM train_logs WHERE order_id=? ORDER BY date DESC, id DESC LIMIT 200").all(o.id).map(r => ({ ...r, data: J(r.data) }));
  return { days, sessions };
}
function trainSave(token, b) {
  const o = trackerOrder(token, "train_log"); if (!o) return { error: "Tracker not found." };
  if (!DATE_RE.test(String(b.date || ""))) return { error: "Pick a date." };
  const day = num(b.day, 1, 6); if (!day) return { error: "Pick a training day." };
  const data = (Array.isArray(b.entries) ? b.entries : []).slice(0, 12).map(e => ({
    ex: String(e.ex || "").slice(0, 80),
    sets: (Array.isArray(e.sets) ? e.sets : []).slice(0, 10).map(x => ({ kg: num(x.kg, 0, 500), reps: num(x.reps, 0, 200) })).filter(x => x.reps !== null && x.reps > 0),
  })).filter(e => e.ex && e.sets.length);
  if (!data.length) return { error: "Enter at least one set with reps." };
  if (db.prepare("SELECT COUNT(*) n FROM train_logs WHERE order_id=?").get(o.id).n >= 2000) return { error: "Tracker is full." };
  db.prepare("INSERT INTO train_logs(order_id,date,day_n,data,note,created_at) VALUES(?,?,?,?,?,?)").run(o.id, b.date, day, JSON.stringify(data), String(b.note || "").slice(0, 300) || null, Date.now());
  return { ok: true };
}
function trainDelete(token, id) {
  const o = trackerOrder(token, "train_log"); if (!o) return false;
  return db.prepare("DELETE FROM train_logs WHERE id=? AND order_id=?").run(Number(id), o.id).changes > 0;
}
function foodList(token) {
  const o = trackerOrder(token, "food_log"); if (!o) return null;
  const ar = J(o.intake).lang === "ar";
  return E.eligibleFoods(listFoods(), o.region, []).map(f => ({ id: f.id, name: E.fName(f, ar), en: f.name, cat: f.cat, kcal: f.kcal, p: f.p, c: f.c, f: f.f, unit: f.unit, unitG: f.unitG }));
}
function foodDay(token, date) {
  const o = trackerOrder(token, "food_log"); if (!o) return null;
  if (!DATE_RE.test(String(date || ""))) date = T.fmt(Date.now(), o.client_tz, { year: "numeric", month: "2-digit", day: "2-digit" }).replace(/(\d+)\/(\d+)\/(\d+)/, "$3-$1-$2");
  const intake = J(o.intake);
  const t = E.targets(intake);
  const entries = db.prepare("SELECT id,name,grams,kcal,p,c,f,meal FROM food_logs WHERE order_id=? AND date=? ORDER BY id").all(o.id, date);
  const history = db.prepare("SELECT date, ROUND(SUM(kcal)) kcal, ROUND(SUM(p)) p FROM food_logs WHERE order_id=? GROUP BY date ORDER BY date DESC LIMIT 14").all(o.id).reverse();
  let meals = [];
  if (o.plan_foods) meals = E.buildPlan(intake, J(o.plan_foods), J(o.picks) || E.defaultPicks(intake.meals)).meals.map((m, i) => ({ i, name: m.name, kcal: m.kcal }));
  return { date, targets: { kcal: t.kcal, p: t.p, c: t.c, f: t.f }, entries, history, meals };
}
function foodAdd(token, b) {
  const o = trackerOrder(token, "food_log"); if (!o) return { error: "Tracker not found." };
  if (!DATE_RE.test(String(b.date || ""))) return { error: "Pick a date." };
  if (db.prepare("SELECT COUNT(*) n FROM food_logs WHERE order_id=? AND date=?").get(o.id, b.date).n >= 80) return { error: "That day is full." };
  const ins = db.prepare("INSERT INTO food_logs(order_id,date,name,grams,kcal,p,c,f,meal,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)");
  const r1 = x => Math.round(x * 10) / 10;
  if (b.meal !== undefined && b.meal !== null && b.meal !== "") {
    // log a whole planned meal at once
    const intake = J(o.intake);
    if (!o.plan_foods) return { error: "No meal plan on this order." };
    const m = E.buildPlan(intake, J(o.plan_foods), J(o.picks) || E.defaultPicks(intake.meals)).meals[Number(b.meal)];
    if (!m) return { error: "Meal not found." };
    const foods = J(o.plan_foods);
    for (const it of m.items) {
      const f = foods.find(x => x.id === it.id); if (!f) continue;
      ins.run(o.id, b.date, E.fName(f, intake.lang === "ar"), it.g, r1(f.kcal * it.g / 100), r1(f.p * it.g / 100), r1(f.c * it.g / 100), r1(f.f * it.g / 100), m.name, Date.now());
    }
    return { ok: true };
  }
  if (b.foodId) {
    const f = listFoods().find(x => x.id === String(b.foodId));
    const g = num(b.grams, 1, 3000);
    if (!f) return { error: "Food not found." };
    if (!g) return { error: "Enter grams between 1 and 3000." };
    ins.run(o.id, b.date, E.fName(f, J(o.intake).lang === "ar"), g, r1(f.kcal * g / 100), r1(f.p * g / 100), r1(f.c * g / 100), r1(f.f * g / 100), null, Date.now());
    return { ok: true };
  }
  const name = String(b.name || "").trim().slice(0, 80);
  const kcal = num(b.kcal, 0, 5000);
  if (!name || kcal === null) return { error: "Enter a name and calories." };
  ins.run(o.id, b.date, name, null, kcal, num(b.p, 0, 500) || 0, num(b.c, 0, 1000) || 0, num(b.f, 0, 500) || 0, null, Date.now());
  return { ok: true };
}
function foodDelete(token, id) {
  const o = trackerOrder(token, "food_log"); if (!o) return false;
  return db.prepare("DELETE FROM food_logs WHERE id=? AND order_id=?").run(Number(id), o.id).changes > 0;
}

/* ---------- Stripe subscription events ---------- */
function stripeRenewalPaid(subId, invoice) {
  const s = db.prepare("SELECT * FROM subscriptions WHERE provider_sub_id=?").get(subId);
  if (!s) return;
  if (db.prepare("SELECT 1 FROM orders WHERE provider_ref=?").get(invoice.id)) return; // already recorded
  const now = Date.now();
  const next = invoice.lines?.data?.[0]?.period?.end ? invoice.lines.data[0].period.end * 1000 : T.addMonth(s.next_charge_at, s.anchor_day);
  const usd = (invoice.amount_paid || 0) / 100;
  const o = { id: newOrderId(), token: rid(24), kind: "renewal", sub_id: s.id, created_at: now, status: "paid", paid_at: now, provider: "stripe", provider_ref: invoice.id,
    name: s.name, email: s.email, phone: s.phone, wa: s.wa, lines: JSON.stringify([{ key: "follow", label: "Coach follow-up (monthly)", usd }]), total_usd: usd,
    charge_amount: invoice.amount_paid, charge_currency: "USD" };
  const cols = Object.keys(o);
  db.prepare(`INSERT INTO orders(${cols.join(",")}) VALUES(${cols.map(() => "?").join(",")})`).run(...cols.map(k => o[k]));
  db.prepare("UPDATE subscriptions SET status='active', next_charge_at=? WHERE id=?").run(next, s.id);
  logEvent(o.id, "renewal_paid", { sub: s.id });
}
function stripeSubStatus(subId, status) {
  db.prepare("UPDATE subscriptions SET status=? WHERE provider_sub_id=?").run(status, subId);
}

/* ---------- background jobs (every few minutes) ---------- */
async function tick() {
  const now = Date.now();
  db.prepare("UPDATE orders SET status='expired' WHERE status='pending' AND kind='plan' AND created_at<?").run(now - PENDING_EXPIRY_MS);
  db.prepare("UPDATE bookings SET status='cancelled' WHERE status='held' AND hold_until<? AND order_id IN (SELECT id FROM orders WHERE status<>'paid')").run(now);

  // Monthly follow-up for gateways without automatic recurring billing (Paymob, mock):
  // create a renewal order and email a payment link on the renewal day.
  const due = db.prepare("SELECT * FROM subscriptions WHERE status='active' AND provider<>'stripe' AND next_charge_at<=? AND pending_order_id IS NULL").all(now);
  for (const s of due) {
    const charge = chargeFor(s.price_usd);
    const o = { id: newOrderId(), token: rid(24), kind: "renewal", sub_id: s.id, created_at: now, status: "pending", provider: s.provider,
      name: s.name, email: s.email, phone: s.phone, wa: s.wa, region: db.prepare("SELECT region FROM orders WHERE id=?").get(s.order_id)?.region,
      lines: JSON.stringify([{ key: "follow", label: "Coach follow-up (monthly)", usd: s.price_usd }]), total_usd: s.price_usd,
      charge_amount: charge.amount, charge_currency: charge.currency, client_tz: db.prepare("SELECT client_tz FROM orders WHERE id=?").get(s.order_id)?.client_tz,
      lang: db.prepare("SELECT lang FROM orders WHERE id=?").get(s.order_id)?.lang || "en" };
    const cols = Object.keys(o);
    tx(() => {
      db.prepare(`INSERT INTO orders(${cols.join(",")}) VALUES(${cols.map(() => "?").join(",")})`).run(...cols.map(k => o[k]));
      db.prepare("UPDATE subscriptions SET pending_order_id=? WHERE id=?").run(o.id, s.id);
    });
    logEvent(o.id, "renewal_created", { sub: s.id });
    const link = `${config.baseUrl}/pay/${o.token}`;
    const parentO = db.prepare("SELECT lang, intake FROM orders WHERE id=?").get(s.order_id) || {};
    const ar = isAr(parentO);
    await mail.send(s.email, ar ? "جدّد المتابعة مع الكوتش" : "Renew your coach follow-up", mail.layout(ar ? "وقت تجديد المتابعة مع الكوتش" : "Time to renew your coach follow-up",
      ar ? `<p>أهلًا ${mail.esc(s.name)}، المتابعة الشهرية بتتجدد النهارده. ادفع ${money(s.price_usd)} عشان تكمّل المتابعة الأسبوعية والمكالمة كل أسبوع.</p>${mail.button(link, "جدّد بـ " + money(s.price_usd))}<p style="font-size:13px;color:#5B6570">لو مش عايز تكمّل، تجاهل الإيميل ده والمتابعة هتنتهي.</p>`
         : `<p>Hi ${mail.esc(s.name)}, your monthly coach follow-up renews today. Pay ${money(s.price_usd)} to keep your weekly check-ins and weekly calls.</p>${mail.button(link, "Renew for " + money(s.price_usd))}<p style="font-size:13px;color:#5B6570">If you don't want to continue, ignore this email and the follow-up ends.</p>`, ar));
  }
  // Unpaid renewals: mark past due after the grace period and tell the coach.
  const late = db.prepare("SELECT * FROM subscriptions WHERE status='active' AND provider<>'stripe' AND pending_order_id IS NOT NULL AND next_charge_at<?").all(now - RENEWAL_GRACE_MS);
  for (const s of late) {
    db.prepare("UPDATE subscriptions SET status='past_due' WHERE id=?").run(s.id);
    logEvent(s.order_id, "renewal_past_due", { sub: s.id });
    if (config.mail.coachEmail) await mail.send(config.mail.coachEmail, `Follow-up not renewed: ${s.name}`, mail.layout("Follow-up not renewed", `<p>${mail.esc(s.name)} (WhatsApp ${mail.esc(s.wa)}) hasn't paid the renewal for 7 days. Their follow-up is paused.</p>`));
  }
}

module.exports = { upgradesForToken, weeklyView, bookWeekly, cancelWeekly, weekKey, FEATURES, availableFeatures, buyAddon, landingToken, trainGet, trainSave, trainDelete, foodList, foodDay, foodAdd, foodDelete, allSlots, takenSet, quote, chargeFor, checkout, payLink, markPaid, markFailed, orderView, swap, tick, sendPaidEmails, stripeRenewalPaid, stripeSubStatus, money, J };
