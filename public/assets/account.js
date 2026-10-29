// "My plans": sign in with an email code, see every plan bought with that email,
// sign out, delete the account. The same page is the start screen of the phone apps,
// where nothing is sold (no prices, no buy buttons).
(function () {
  const APP = /RepvoApp/.test(navigator.userAgent);
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const TXT = {
    en: {
      signTitle: "My plans", signSub: "Sign in with the email you used when you ordered. We'll send you a 6-digit code. No password needed.",
      email: "Email", sendCode: "Send my code", codeSent: e => `We sent a 6-digit code to <b>${e}</b>. It works for 15 minutes. Check your spam folder if you don't see it.`,
      code: "Code", signIn: "Sign in", otherEmail: "Use a different email", resend: "Send a new code",
      hi: n => (n ? `Hi, ${n.split(" ")[0]}` : "Your plans"), plansSub: "Tap a plan to open your meals, workouts, trackers and coach calls.",
      open: "Open", paid: d => `Bought ${d}`, coachReview: "Coach is building this plan with you",
      goals: { loss: "Fat loss", gain: "Muscle gain", recomp: "Recomp", perf: "Performance" }, days: n => `${n} days a week`, ar: "Arabic", en: "English",
      pkg: { workout: "Workout plan", nutrition: "Nutrition plan", both: "Workout + nutrition" },
      feats: { train_log: "Training tracker", food_log: "Nutrition tracker", videos: "Exercise videos", recipes: "Recipes", supplements: "Supplements", cardio: "Cardio plan" },
      follow: s => s === "active" ? "Coach follow-up is active. Book your weekly call from the Coach tab in your plan." : s === "past_due" ? "Coach follow-up is paused until the renewal is paid." : "",
      none: "There are no plans on this email yet.", noneWeb: "Get your plan", noneApp: "Plans bought with this email show up here.",
      another: "Get another plan", signOut: "Sign out",
      delTitle: "Delete my account", delSub: "This removes your name, contact details, plans and logs for good, and stops any coach follow-up. Payment amounts and dates are kept for our accounts. This can't be undone.",
      delType: "Type DELETE to confirm", delBtn: "Delete my account", deleted: "Your account was deleted. Thank you for training with Repvo.",
      wrong: "Something went wrong. Please try again.", offline: "You're offline. Connect to the internet and try again.",
      slogan: "Lift right. Eat right.", terms: "Terms, refunds & privacy", langBtn: "العربية",
      addTitle: "Add to this plan", addSub: "Pay on a secure page. It shows up on your plan straight away.",
      upName: { follow: "Coach follow-up", call: "Coach call" },
      why: { train_log: "Log weights and reps for every set and see your progress.", food_log: "Log what you eat and compare it with your targets every day.",
        videos: "Coach videos and form cues beside every exercise.", recipes: "A healthy recipe for every meal in your plan.",
        supplements: "What to take for your goal, how much and when.", cardio: "Weekly cardio around your lifting days, with heart-rate zones.",
        follow: "Your coach checks in every week on WhatsApp, and you book one call a week. Renews monthly; cancel any time.",
        call: "One WhatsApp call with a coach about your plan, your form or your progress." },
      perMonth: p => `${p}/month`, add: "Add", startFollow: "Start", pickTime: "Pick a time",
      chooseTime: "Choose a time", bookPay: "Book and pay", cancel: "Cancel", noSlots: "No free times in the next two weeks. Please check again tomorrow.",
      yourTime: tz => `Times are in your time zone (${tz}).`, opening: "Opening the payment page…",
    },
    ar: {
      signTitle: "خططي", signSub: "سجّل دخول بالإيميل اللي طلبت بيه. هنبعتلك كود من 6 أرقام. مفيش باسورد.",
      email: "الإيميل", sendCode: "ابعتلي الكود", codeSent: e => `بعتنا كود من 6 أرقام لـ <b dir="ltr">${e}</b>. صالح 15 دقيقة. شوف الـ Spam لو مش لاقيه.`,
      code: "الكود", signIn: "دخول", otherEmail: "استخدم إيميل تاني", resend: "ابعت كود جديد",
      hi: n => (n ? `أهلًا ${n.split(" ")[0]}` : "خططك"), plansSub: "اضغط على الخطة عشان تفتح الأكل والتمرين والمتابعة ومكالمات الكوتش.",
      open: "افتح", paid: d => `اشتريتها ${d}`, coachReview: "الكوتش بيعمل الخطة دي معاك",
      goals: { loss: "خسارة دهون", gain: "زيادة عضل", recomp: "إعادة تشكيل", perf: "أداء" }, days: n => `${n === 2 ? "يومين" : n + " أيام"} في الأسبوع`, ar: "عربي", en: "إنجليزي",
      pkg: { workout: "خطة تمرين", nutrition: "خطة أكل", both: "تمرين + أكل" },
      feats: { train_log: "متابعة التمرين", food_log: "متابعة الأكل", videos: "فيديوهات", recipes: "وصفات", supplements: "مكملات", cardio: "كارديو" },
      follow: s => s === "active" ? "المتابعة مع الكوتش مفعّلة. احجز مكالمتك الأسبوعية من تبويب الكوتش في خطتك." : s === "past_due" ? "المتابعة متوقفة لحد ما التجديد يتدفع." : "",
      none: "مفيش خطط بالإيميل ده لسه.", noneWeb: "اعمل خطتك", noneApp: "الخطط اللي بتشتريها بالإيميل ده بتظهر هنا.",
      another: "اعمل خطة تانية", signOut: "تسجيل خروج",
      delTitle: "امسح حسابي", delSub: "ده بيمسح اسمك وبيانات التواصل والخطط والمتابعة نهائيًا، وبيوقف أي متابعة مع الكوتش. بنحتفظ بمبالغ وتواريخ الدفع بس لحساباتنا. مينفعش ترجع فيه.",
      delType: "اكتب DELETE للتأكيد", delBtn: "امسح حسابي", deleted: "حسابك اتمسح. شكرًا إنك اتمرنت مع Repvo.",
      wrong: "حصلت مشكلة. جرّب تاني.", offline: "انت مش متصل بالإنترنت. اتصل وجرّب تاني.",
      slogan: "اتمرّن صح. كُل صح.", terms: "الشروط والاسترجاع والخصوصية", langBtn: "English",
      addTitle: "أضف للخطة دي", addSub: "ادفع من صفحة دفع آمنة. الإضافة بتظهر في خطتك على طول.",
      upName: { follow: "متابعة مع الكوتش", call: "مكالمة مع الكوتش" },
      why: { train_log: "سجّل الأوزان والعدات لكل مجموعة وتابع تقدمك.", food_log: "سجّل أكلك وقارنه بأهدافك كل يوم.",
        videos: "فيديوهات الكوتش وتعليمات الأداء جنب كل تمرين.", recipes: "وصفة صحية لكل وجبة في خطتك.",
        supplements: "إيه اللي تاخده لهدفك، وقد إيه، وإمتى.", cardio: "كارديو أسبوعي حوالين أيام الحديد، بمناطق نبض.",
        follow: "الكوتش بيتابع معاك كل أسبوع على واتساب، وبتحجز مكالمة كل أسبوع. بتتجدد شهريًا وتقدر تلغيها في أي وقت.",
        call: "مكالمة واتساب مع كوتش عن خطتك أو أدائك أو تقدمك." },
      perMonth: p => `${p} في الشهر`, add: "أضف", startFollow: "ابدأ", pickTime: "اختار ميعاد",
      chooseTime: "اختار ميعاد", bookPay: "احجز وادفع", cancel: "إلغاء", noSlots: "مفيش مواعيد فاضية في الأسبوعين الجايين. جرّب تاني بكرة.",
      yourTime: tz => `المواعيد بتوقيتك (${tz}).`, opening: "بنفتح صفحة الدفع…",
    },
  };
  let lang = "en";
  try { lang = localStorage.getItem("rv_lang") || ((navigator.language || "").startsWith("ar") ? "ar" : "en"); } catch {}
  let L = TXT[lang], state = { step: "email", email: "", me: null, msg: "", err: "" };

  function setLang(l) {
    lang = l; L = TXT[l];
    try { localStorage.setItem("rv_lang", l); } catch {}
    document.documentElement.lang = l; document.documentElement.dir = l === "ar" ? "rtl" : "ltr";
    $("lang").textContent = L.langBtn; $("slogan").textContent = L.slogan; $("termslink").textContent = L.terms;
    render();
  }
  $("lang").onclick = () => setLang(lang === "ar" ? "en" : "ar");

  async function api(url, body) {
    let r;
    try { r = await fetch(url, body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
    catch { throw new Error(L.offline); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || L.wrong), { status: r.status });
    return j;
  }
  const money = n => "$" + Number(n).toFixed(2).replace(/\.00$/, "");
  const userTZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } })();
  const slotLabel = ts => { try { return new Intl.DateTimeFormat(lang === "ar" ? "ar-EG-u-nu-latn" : "en-US", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(ts)); } catch { return new Date(ts).toString(); } };
  const upName = u => L.feats[u.key] || L.upName[u.key] || u.label;
  function upgradesHTML(p, open) {
    if (APP || !p.upgrades || !p.upgrades.length) return "";
    return `<details class="addbox"${open ? " open" : ""}><summary>${L.addTitle}</summary><p class="note">${L.addSub}</p>
      <div class="uplist">${p.upgrades.map(u => `<div class="uprow" data-row="${esc(p.token)}:${esc(u.key)}">
        <div class="uptx"><b>${esc(upName(u))}</b><span>${esc(L.why[u.key] || "")}</span></div>
        <div class="upbuy"><span class="upprice">${esc(u.recurring ? L.perMonth(money(u.usd)) : money(u.usd))}</span>
        <button class="btn small" type="button" data-up="${esc(u.key)}" data-tok="${esc(p.token)}">${u.slot ? L.pickTime : u.recurring ? L.startFollow : L.add}</button></div>
        <div class="slotbox" hidden></div></div>`).join("")}</div>
      <p class="err" role="alert" hidden></p></details>`;
  }
  async function buy(tok, key, slot, box) {
    const errEl = box.querySelector(".err");
    errEl.hidden = true;
    try {
      const r = await api(`/api/order/${encodeURIComponent(tok)}/addon`, { feature: key, slot });
      location.href = r.url;
    } catch (x) { errEl.textContent = x.message; errEl.hidden = false; box.querySelectorAll("button").forEach(b => (b.disabled = false)); }
  }
  async function pickSlot(row, tok, box) {
    const sb = row.querySelector(".slotbox");
    if (!sb.hidden) { sb.hidden = true; return; }
    sb.hidden = false; sb.innerHTML = '<p class="note"><span class="spin"></span></p>';
    let slots = [];
    try { slots = (await api("/api/slots")).filter(x => !x.taken && x.ts > Date.now() + 3600e3).slice(0, 40); } catch (x) { sb.innerHTML = `<p class="err">${esc(x.message)}</p>`; return; }
    if (!slots.length) { sb.innerHTML = `<p class="note">${L.noSlots}</p>`; return; }
    sb.innerHTML = `<label class="f">${L.chooseTime}<select>${slots.map(x => `<option value="${x.ts}">${esc(slotLabel(x.ts))}</option>`).join("")}</select></label>
      <p class="note">${esc(L.yourTime(userTZ))}</p>
      <div class="actrow"><button class="btn small" type="button" data-go>${L.bookPay}</button><button class="linkbtn" type="button" data-x>${L.cancel}</button></div>`;
    sb.querySelector("[data-x]").onclick = () => { sb.hidden = true; };
    sb.querySelector("[data-go]").onclick = e => { e.target.disabled = true; buy(tok, "call", Number(sb.querySelector("select").value), box); };
  }
  const date = ts => { try { return new Intl.DateTimeFormat(lang === "ar" ? "ar-EG-u-nu-latn" : "en-US", { day: "numeric", month: "long", year: "numeric" }).format(new Date(ts)); } catch { return ""; } };

  function render() {
    const root = $("root");
    const err = state.err ? `<div class="err" role="alert">${esc(state.err)}</div>` : "";
    if (state.step === "deleted") { root.innerHTML = `<div class="panel sec"><h1 class="acth">${L.delTitle}</h1><p>${L.deleted}</p></div>`; return; }
    if (state.step === "email" || state.step === "code") {
      root.innerHTML = `<form class="panel sec actform" id="f" novalidate>
        <h1 class="acth">${L.signTitle}</h1><p class="sub">${L.signSub}</p>
        <label class="f">${L.email}<input type="email" id="em" autocomplete="email" inputmode="email" dir="ltr" required value="${esc(state.email)}" ${state.step === "code" ? "readonly" : ""}></label>
        ${state.step === "code" ? `<p class="msg">${L.codeSent(esc(state.email))}</p>
          <label class="f">${L.code}<input type="text" id="cd" class="codein" autocomplete="one-time-code" inputmode="numeric" pattern="[0-9]*" maxlength="6" dir="ltr" required></label>` : ""}
        ${err}
        <button class="btn big" type="submit" id="go">${state.step === "code" ? L.signIn : L.sendCode}</button>
        ${state.step === "code" ? `<div class="actrow"><button class="linkbtn" type="button" id="other">${L.otherEmail}</button><button class="linkbtn" type="button" id="again">${L.resend}</button></div>` : ""}
      </form>`;
      const f = $("f");
      (state.step === "code" ? $("cd") : $("em")).focus();
      f.onsubmit = async e => {
        e.preventDefault(); state.err = ""; $("go").disabled = true;
        try {
          if (state.step === "email") { state.email = $("em").value.trim(); await api("/api/auth/code", { email: state.email, lang }); state.step = "code"; }
          else { await api("/api/auth/verify", { email: state.email, code: $("cd").value }); await load(); return; }
        } catch (x) { state.err = x.message; }
        render();
      };
      if ($("cd")) $("cd").oninput = e => { if (e.target.value.replace(/\D/g, "").length === 6) f.requestSubmit(); };
      if ($("other")) $("other").onclick = () => { state = { ...state, step: "email", err: "" }; render(); };
      if ($("again")) $("again").onclick = async () => { state.err = ""; try { await api("/api/auth/code", { email: state.email, lang }); } catch (x) { state.err = x.message; } render(); };
      return;
    }
    const me = state.me;
    const plans = me.plans.map((p, i) => `<div class="planitem"><a class="plancard" href="/plan/${encodeURIComponent(p.token)}">
        <div><h3>${esc(L.pkg[p.pkg] || p.pkgName)}</h3>
        <p class="note">${p.flagged ? esc(L.coachReview) : [L.goals[p.goal], p.pkg !== "nutrition" && p.days ? L.days(p.days) : "", p.lang === "ar" ? L.ar : L.en].filter(Boolean).map(esc).join(" · ")}</p>
        ${p.features.length ? `<p class="tags">${p.features.map(k => `<span>${esc(L.feats[k] || k)}</span>`).join("")}</p>` : ""}
        <p class="note">${esc(L.paid(date(p.paidAt)))}</p></div>
        <span class="btn small">${L.open} ${lang === "ar" ? "←" : "→"}</span></a>${upgradesHTML(p, i === 0)}</div>`).join("");
    const fol = me.follow ? L.follow(me.follow.status) : "";
    root.innerHTML = `<div class="panel sec"><h1 class="acth">${esc(L.hi(me.name))}</h1><p class="sub">${me.plans.length ? L.plansSub : ""}</p>
        ${fol ? `<p class="msg">${esc(fol)}</p>` : ""}
        <div class="plans">${plans || `<p>${L.none} ${APP ? L.noneApp : `<a class="btn small" href="/#start">${L.noneWeb}</a>`}</p>`}</div>
        <div class="actrow" style="margin-top:16px">${!APP && me.plans.length ? `<a class="btn ghost small" href="/#start">${L.another}</a>` : ""}<button class="linkbtn" type="button" id="out">${L.signOut}</button></div></div>
      <details class="panel sec danger"><summary>${L.delTitle}</summary>
        <p class="sub" style="margin-top:10px">${L.delSub}</p>
        <label class="f">${L.delType}<input type="text" id="del" autocomplete="off" dir="ltr"></label>${err}
        <button class="btn dangerbtn" type="button" id="delgo" style="margin-top:10px">${L.delBtn}</button></details>`;
    root.querySelectorAll("[data-up]").forEach(b => b.onclick = () => {
      const box = b.closest(".addbox"), row = b.closest(".uprow");
      if (b.dataset.up === "call") return pickSlot(row, b.dataset.tok, box);
      b.disabled = true; buy(b.dataset.tok, b.dataset.up, null, box);
    });
    $("out").onclick = async () => { try { await api("/api/auth/logout", {}); } catch {} state = { step: "email", email: "", me: null, err: "" }; render(); };
    $("delgo").onclick = async () => {
      state.err = ""; $("delgo").disabled = true;
      try { await api("/api/me/delete", { confirm: $("del").value }); state = { step: "deleted", err: "" }; }
      catch (x) { state.err = x.message; }
      render();
      const d = document.querySelector("details.danger"); if (d && state.err) d.open = true;
    };
  }

  // after signing in from a locked article, go back to it
  const NEXT = (() => { try { const n = new URLSearchParams(location.search).get("next") || ""; return /^\/blog\/[\w%-]+$/.test(n) ? n : ""; } catch { return ""; } })();
  async function load() {
    try { state.me = await api("/api/me"); state.step = "plans"; if (NEXT && state.me.plans.length) { location.replace(NEXT); return; } }
    catch (x) { state.step = "email"; if (x.status !== 401) state.err = x.message; }
    render();
  }
  if (APP) document.documentElement.classList.add("in-app");
  setLang(lang);
  load();
})();
