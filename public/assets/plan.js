(function () {
"use strict";
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = n => "$" + Number(n).toFixed(2).replace(/\.00$/, "");
const token = location.pathname.split("/").pop();
const qs = new URLSearchParams(location.search);
const PLAN_URL = t => "/plan/" + encodeURIComponent(t);
const root = $("root");
const userTZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } })();
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ---------- language ---------- */
const TXT = {
  en: {
    loadErr: "We couldn't load this page. Check your connection and refresh.",
    notFound: "Plan not found", notFoundSub: "This link isn't valid. Use the link from your email, or start a new plan.", getPlan: "Get my plan",
    paid: "Paid", total: "Total", charged: (c, a) => `Charged ${c} ${a}.`,
    callTitle: "Coach call", cancelled: " (cancelled)", done: " (done)", callOnWa: wa => `The coach will call you on WhatsApp at ${wa}.`,
    followOn: (d, p, auto, next) => `<b>Coach follow-up is active.</b> Weekly check-in plus one call every week (book it in the Coach tab). Renews monthly on the ${d} at ${p}${auto ? " (charged automatically)" : " (we email you a payment link)"}. Next: ${next}.`,
    followOnApp: "<b>Coach follow-up is active.</b> Weekly check-in plus one call every week (book it in the Coach tab).",
    followOff: s => `<b>Coach follow-up:</b> ${s === "past_due" ? "paused until the renewal is paid" : "ended"}.`,
    titleRenewal: "Coach follow-up renewal · Repvo", titlePlan: "Your plan · Repvo",
    payNot: "Payment not completed", expired: "This order has expired", confirming: "Confirming your payment…",
    payNotSub: "No money was taken for this attempt. You can try again; your details and call time are kept for a short while.",
    expiredSub: "It wasn't paid in time. Start again and your details will still be filled in.",
    confirmingSub: "This usually takes a few seconds. Keep this page open.",
    backPlan: "Back to my plan", changeOrder: "Change my order", startAgain: "Start again", tryAgain: "Try payment again", reopen: "Reopen payment",
    renewed: "Follow-up renewed", renewedSub: n => `Thanks${n ? ", " + n : ""}. Your coach keeps working with you for another month.`,
    order: "Order", yourCall: "Your coach call", plansOf: n => n ? `${n}'s plan` : "Your plan",
    paidOn: (pkg, d) => `${pkg} · paid ${d}.`, bookmark: "Bookmark this page; the link is also in your email.", print: "Print or save PDF",
    tPlan: "Plan", tTrain: "Training log", tFood: "Food log", tCoach: "Coach",
    flagTitle: "A coach will build your plan with you", flagSub: f => `Because of the health details you shared (${f}), we don't generate an automatic plan. Your coach builds it with you on the call.`,
    addTitle: "Add to your plan", addSub: "Pay on a secure page. It appears here as soon as payment goes through.", addFor: p => `Add for ${p}`,
    perMonth: p => `${p}/month`, startFor: p => `Start for ${p}/month`, pickTime: "Pick a time", chooseTime: "Choose a time", bookPay: "Book and pay", cancelBtn: "Cancel",
    noSlots: "No free times in the next two weeks. Please check again tomorrow.", yourTime: tz => `Times are in your time zone (${tz}).`,
    why: { train_log: "Log weights and reps for every set and see your progress.", food_log: "Log what you eat and compare it with your targets every day.", videos: "Coach videos and form cues beside every exercise.", recipes: "A healthy recipe for every meal in your plan.", supplements: "What to take for your goal, how much and when, and what to skip.", cardio: "Weekly cardio around your lifting days, with heart-rate zones and a 4-week progression.", follow: "Your coach checks in every week on WhatsApp, and you book one call a week. Renews monthly; cancel any time.", call: "One WhatsApp call with a coach about your plan, your form or your progress." },
    labels: { train_log: "Training tracker", food_log: "Nutrition tracker", videos: "Exercise videos", recipes: "Healthy recipes", supplements: "Supplements guide", cardio: "Cardio plan", workout: "Workout plan", nutrition: "Nutrition plan", both: "Workout + nutrition bundle", follow: "Coach follow-up: weekly check-in + weekly call", call: "Coach call" },
    receipt: "Receipt", sentTo: (e, w) => `Sent to ${e} · WhatsApp ${w}`,
    targets: "Daily targets", targetsSub: "Calculated from your data. These numbers drive every meal below.",
    kcal: "Calories", prot: "Protein", carbs: "Carbs", fat: "Fat", vsMaint: a => `${a > 0 ? "+" : ""}${a}% vs maintenance`, maint: "maintenance", gkg: (p, b) => `${p} g/kg × ${b} kg`, rest: "remaining energy", ofKcal: p => `${p}% of calories`,
    lean: "Lean mass", g: "g", u_kcal: "kcal",
    meals: "Meal plan", mealsSub: "Weigh foods as listed (cooked weight for meat, rice and pasta; dry weight for oats). Tap Swap to change a food; portions recalculate to keep the meal on target.",
    swap: "Swap", swapA: n => `Swap ${n}`, noFoods: "No foods available for this meal.", recipe: "Recipe", min: "min", ingredients: "Ingredients", spices: "Spices, herbs and lemon to taste", steps: "Steps",
    training: "Training plan", trainingSub: (d, eq, sp) => `${sp}, ${d} days per week, ${eq}. 4 sets of every exercise (sets × reps on the right), rest between sets underneath.`,
    adjTitle: a => `Adjusted for your ${a}`, adjSwap: "Swapped for a safer option:", adjOut: "Left out:", adjNote: "Replacements that are easy on the area were added. Stop any exercise that causes pain, and book a coach call if pain continues.",
    cardio: "Cardio plan", cardioSub: m => `Built around your lifting days. Your estimated max heart rate is ${m} beats per minute; the zones below come from it.`,
    zonesT: "Your heart-rate zones", bpm: "bpm", weekT: "Your week", lifting: "Lifting", cardioCol: "Cardio", sessionsT: "Sessions and 4-week progression", options: "Pick any", stepsT: "Daily steps goal", perWeek: n => `${n}× a week`, wk: n => `Week ${n}`, stepsU: "steps",
    day: "Day", exercises: n => `${n} exercises`, restL: "rest", watch: "Watch video", cues: "Form cues", soon: "Video coming soon.",
    weeks: [["Week 1", "Learn the movements. Stop 3 reps short of failure (RIR 3)."], ["Week 2", "Add weight or reps. RIR 2."], ["Week 3", "Push the top sets. RIR 1."], ["Week 4", "Cut sets in half, then update your stats for the next phase."]],
    supp: "Supplements guide", suppSub: "Built for your goal, body weight and diet.", suppDose: "How much", suppWhen: "When", suppSkip: "Skip these", suppNotes: "Good to know",
    logTitle: "Log a session", logSub: "Enter the weight and reps you did for each set. Grey numbers are what you did last time on this day.",
    trainingDay: "Training day", date: "Date", exercise: "Exercise", setsKgReps: "Sets: kg × reps", save: "Save session", saved: "Saved.", needReps: "Enter reps for at least one set.",
    progress: "Progress", progressSub: "Estimated one-rep max from your best set each session (weight × (1 + reps ÷ 30)).",
    lastTop: "Last top set", best1rm: "Best est. 1RM", change: "Change", trend: "Trend", firstSession: "Save your first session to see progress here.",
    history: "History", session: "Session", sets: "Sets", volume: "Volume", del: "Delete", delSure: "Tap again to delete", noSessions: "No sessions yet.",
    left: n => `${n} kcal left today`, over: n => `${n} kcal over target`, addFood: "Add food", ateMeal: "Ate a meal from your plan? Log it in one tap.",
    search: n => `Search ${n} foods`, searchPh: "e.g. koshari, rice, chicken", per100: "per 100 g", noMatch: 'No match. Use "Something else" below.',
    gramsOf: n => `Grams of ${n}`, unitIs: (u, g) => `1 ${u} ≈ ${g} g`, add: "Add", custom: "Something else (enter calories yourself)", name: "Name", eaten: "Eaten",
    food: "Food", amount: "Amount", remove: "Remove", nothing: "Nothing logged for this day yet.", lastDays: n => n === 1 ? "Today so far" : `Last ${n} days`,
    vsTarget: k => `Calories eaten against your ${k} kcal target (the line).`, green: "Green: within 10% of target.", prev: "Previous day", next: "Next day",
    coachTitle: "Your weekly call", coachSub: (m) => `Book one ${m}-minute call with your coach each week (weeks start on Saturday). Times are in your time zone.`,
    coachUntil: d => `Your current month runs until ${d}. Calls after that open when you renew.`, coachInactive: "Your follow-up isn't active. Renew it from the link in your email to book calls.",
    upcoming: "Your calls", noCalls: "No calls booked yet.", cancelCall: "Cancel", book: "Book this time", pickTime: "Pick a time", booked: "Booked", weekUsed: "Week booked", bookedOk: "Booked. We've emailed you the details.",
    cancelNote: "You can cancel up to 24 hours before a call.",
  },
  ar: {
    loadErr: "مقدرناش نحمّل الصفحة. اتأكد من الإنترنت وجرّب تاني.",
    notFound: "الخطة مش موجودة", notFoundSub: "اللينك ده مش صحيح. استخدم اللينك اللي في الإيميل، أو ابدأ خطة جديدة.", getPlan: "اعمل خطتي",
    paid: "المدفوع", total: "الإجمالي", charged: (c, a) => `تم الخصم ${a} ${c}.`,
    callTitle: "مكالمة الكوتش", cancelled: " (اتلغت)", done: " (خلصت)", callOnWa: wa => `الكوتش هيكلمك على واتساب على ${wa}.`,
    followOn: (d, p, auto, next) => `<b>المتابعة مع الكوتش مفعّلة.</b> متابعة أسبوعية ومكالمة كل أسبوع (احجزها من تبويب الكوتش). التجديد شهريًا يوم ${d} بـ ${p}${auto ? " (بيتخصم تلقائيًا)" : " (هنبعتلك لينك الدفع على الإيميل)"}. التجديد الجاي: ${next}.`,
    followOnApp: "<b>المتابعة مع الكوتش مفعّلة.</b> متابعة أسبوعية ومكالمة كل أسبوع (احجزها من تبويب الكوتش).",
    followOff: s => `<b>المتابعة مع الكوتش:</b> ${s === "past_due" ? "موقوفة لحد ما تجدّد" : "انتهت"}.`,
    titleRenewal: "تجديد المتابعة · Repvo", titlePlan: "خطتك · Repvo",
    payNot: "الدفع ما كملش", expired: "الطلب ده انتهى", confirming: "بنأكد الدفع…",
    payNotSub: "مفيش فلوس اتخصمت في المحاولة دي. تقدر تحاول تاني؛ بياناتك وميعاد المكالمة محفوظين لفترة قصيرة.",
    expiredSub: "الطلب ما اتدفعش في الوقت. ابدأ تاني وبياناتك هتكون متسجلة.",
    confirmingSub: "ده بياخد ثواني. خلي الصفحة مفتوحة.",
    backPlan: "ارجع لخطتي", changeOrder: "عدّل طلبي", startAgain: "ابدأ من جديد", tryAgain: "جرّب الدفع تاني", reopen: "افتح صفحة الدفع",
    renewed: "تم تجديد المتابعة", renewedSub: n => `شكرًا${n ? " يا " + n : ""}. الكوتش مكمّل معاك شهر كمان.`,
    order: "طلب رقم", yourCall: "مكالمتك مع الكوتش", plansOf: n => n ? `خطة ${n}` : "خطتك",
    paidOn: (pkg, d) => `${pkg} · اتدفعت ${d}.`, bookmark: "احفظ الصفحة دي؛ اللينك كمان موجود في الإيميل.", print: "اطبع أو احفظ PDF",
    tPlan: "الخطة", tTrain: "سجل التمرين", tFood: "سجل الأكل", tCoach: "الكوتش",
    flagTitle: "الكوتش هيعمل خطتك معاك", flagSub: f => `بسبب المعلومات الصحية اللي شاركتها (${f})، مش بنعمل خطة أوتوماتيك. الكوتش هيعملها معاك في المكالمة.`,
    addTitle: "أضف لخطتك", addSub: "ادفع من صفحة دفع آمنة. بتظهر هنا أول ما الدفع يتم.", addFor: p => `أضف بـ ${p}`,
    perMonth: p => `${p} في الشهر`, startFor: p => `ابدأ بـ ${p} في الشهر`, pickTime: "اختار ميعاد", chooseTime: "اختار ميعاد", bookPay: "احجز وادفع", cancelBtn: "إلغاء",
    noSlots: "مفيش مواعيد فاضية في الأسبوعين الجايين. جرّب تاني بكرة.", yourTime: tz => `المواعيد بتوقيتك (${tz}).`,
    why: { train_log: "سجّل الأوزان والعدات لكل مجموعة وتابع تقدمك.", food_log: "سجّل أكلك وقارنه بأهدافك كل يوم.", videos: "فيديوهات الكوتش وتعليمات الأداء جنب كل تمرين.", recipes: "وصفة صحية لكل وجبة في خطتك.", supplements: "إيه اللي تاخده لهدفك، وقد إيه، وإمتى، وإيه اللي تسيبه.", cardio: "كارديو أسبوعي حوالين أيام الحديد، بمناطق نبض وتدرج على 4 أسابيع.", follow: "الكوتش بيتابع معاك كل أسبوع على واتساب، وبتحجز مكالمة كل أسبوع. بتتجدد شهريًا وتقدر تلغيها في أي وقت.", call: "مكالمة واتساب مع كوتش عن خطتك أو أدائك أو تقدمك." },
    labels: { train_log: "متابعة التمرين", food_log: "متابعة الأكل", videos: "فيديوهات التمارين", recipes: "وصفات صحية", supplements: "دليل المكملات", cardio: "خطة الكارديو", workout: "خطة تمرين", nutrition: "خطة أكل", both: "باقة تمرين + أكل", follow: "متابعة مع الكوتش: متابعة أسبوعية + مكالمة كل أسبوع", call: "مكالمة مع الكوتش" },
    receipt: "الإيصال", sentTo: (e, w) => `اتبعت على ${e} · واتساب ${w}`,
    targets: "أهدافك اليومية", targetsSub: "محسوبة من بياناتك. الأرقام دي هي اللي بتحدد كل وجبة تحت.",
    kcal: "السعرات", prot: "بروتين", carbs: "كربوهيدرات", fat: "دهون", vsMaint: a => `${a > 0 ? "+" : ""}${a}% عن الثبات`, maint: "ثبات", gkg: (p, b) => `${p} جم/كجم × ${b} كجم`, rest: "باقي الطاقة", ofKcal: p => `${p}% من السعرات`,
    lean: "الكتلة العضلية", g: "جم", u_kcal: "سعر",
    meals: "خطة الأكل", mealsSub: "وزّن الأكل زي ما هو مكتوب (اللحوم والأرز والمكرونة بعد الطهي، والشوفان ناشف). اضغط تبديل عشان تغيّر أكلة؛ الكميات بتتحسب تاني عشان الوجبة تفضل مظبوطة.",
    swap: "تبديل", swapA: n => `تبديل ${n}`, noFoods: "مفيش أكل متاح للوجبة دي.", recipe: "الوصفة", min: "دقيقة", ingredients: "المكونات", spices: "توابل وأعشاب وليمون حسب الذوق", steps: "الطريقة",
    training: "خطة التمرين", trainingSub: (d, eq, sp) => `${sp}، ${d === 2 ? "يومين" : d + " أيام"} في الأسبوع، ${eq}. 4 مجموعات لكل تمرين (المجموعات × العدات على الجنب)، والراحة بين المجموعات تحتها.`,
    adjTitle: a => `معدّلة عشان ${a}`, adjSwap: "اتبدّل بتمرين آمن أكتر:", adjOut: "اتشال:", adjNote: "ضفنا تمارين بديلة خفيفة على المنطقة دي. وقّف أي تمرين يسببلك ألم، واحجز مكالمة مع الكوتش لو الألم مستمر.",
    cardio: "خطة الكارديو", cardioSub: m => `معمولة حوالين أيام الحديد بتاعتك. أقصى نبض متوقع ليك حوالي ${m} نبضة في الدقيقة، والمناطق اللي تحت محسوبة منه.`,
    zonesT: "مناطق النبض بتاعتك", bpm: "نبضة/د", weekT: "أسبوعك", lifting: "الحديد", cardioCol: "الكارديو", sessionsT: "الحصص والتدرج على 4 أسابيع", options: "اختار أي واحد", stepsT: "هدف الخطوات اليومي", perWeek: n => n === 2 ? "مرتين في الأسبوع" : `${n} مرات في الأسبوع`, wk: n => `الأسبوع ${n}`, stepsU: "خطوة",
    day: "اليوم", exercises: n => `${n} تمارين`, restL: "راحة", watch: "شوف الفيديو", cues: "تعليمات الأداء", soon: "الفيديو قريبًا.",
    weeks: [["الأسبوع 1", "اتعلم الحركات. وقّف قبل الفشل بـ 3 عدات (RIR 3)."], ["الأسبوع 2", "زوّد الوزن أو العدات. RIR 2."], ["الأسبوع 3", "اضغط في المجموعات الأساسية. RIR 1."], ["الأسبوع 4", "قلّل المجموعات للنص، وبعدها حدّث بياناتك للمرحلة الجاية."]],
    supp: "دليل المكملات", suppSub: "معمول لهدفك ووزنك وأكلك.", suppDose: "الكمية", suppWhen: "إمتى", suppSkip: "سيب دول", suppNotes: "مهم تعرف",
    logTitle: "سجّل تمرين", logSub: "اكتب الوزن والعدات لكل مجموعة. الأرقام الرمادي هي اللي عملتها آخر مرة في اليوم ده.",
    trainingDay: "يوم التمرين", date: "التاريخ", exercise: "التمرين", setsKgReps: "المجموعات: كجم × عدات", save: "احفظ التمرين", saved: "اتحفظ.", needReps: "اكتب العدات لمجموعة واحدة على الأقل.",
    progress: "التقدم", progressSub: "أقصى وزن تقديري لعدة واحدة من أحسن مجموعة في كل تمرين (الوزن × (1 + العدات ÷ 30)).",
    lastTop: "آخر أحسن مجموعة", best1rm: "أعلى 1RM تقديري", change: "التغيير", trend: "الاتجاه", firstSession: "احفظ أول تمرين عشان تشوف تقدمك هنا.",
    history: "السجل", session: "التمرين", sets: "مجموعات", volume: "الحجم", del: "امسح", delSure: "اضغط تاني للمسح", noSessions: "مفيش تمارين متسجلة لسه.",
    left: n => `فاضل ${n} سعر النهارده`, over: n => `زيادة ${n} سعر عن الهدف`, addFood: "أضف أكل", ateMeal: "أكلت وجبة من خطتك؟ سجّلها بضغطة واحدة.",
    search: n => `ابحث في ${n} أكلة`, searchPh: "مثلًا: كشري، أرز، فراخ", per100: "لكل 100 جم", noMatch: "مفيش نتيجة. استخدم \"حاجة تانية\" تحت.",
    gramsOf: n => `جرامات ${n}`, unitIs: (u, g) => `1 ${u} ≈ ${g} جم`, add: "أضف", custom: "حاجة تانية (اكتب السعرات بنفسك)", name: "الاسم", eaten: "اللي أكلته",
    food: "الأكل", amount: "الكمية", remove: "شيل", nothing: "مفيش أكل متسجل في اليوم ده لسه.", lastDays: n => n === 1 ? "النهارده لحد دلوقتي" : `آخر ${n} أيام`,
    vsTarget: k => `السعرات اللي أكلتها مقارنة بهدفك ${k} سعر (الخط).`, green: "الأخضر: في حدود 10% من الهدف.", prev: "اليوم اللي فات", next: "اليوم اللي بعده",
    coachTitle: "مكالمتك الأسبوعية", coachSub: (m) => `احجز مكالمة ${m} دقيقة مع الكوتش كل أسبوع (الأسبوع بيبدأ يوم السبت). المواعيد بتوقيتك.`,
    coachUntil: d => `شهرك الحالي لحد ${d}. المكالمات بعد كده بتفتح لما تجدّد.`, coachInactive: "المتابعة مش مفعّلة. جدّدها من اللينك اللي في الإيميل عشان تحجز مكالمات.",
    upcoming: "مكالماتك", noCalls: "مفيش مكالمات محجوزة لسه.", cancelCall: "إلغاء", book: "احجز الميعاد ده", pickTime: "اختار ميعاد", booked: "محجوز", weekUsed: "الأسبوع محجوز", bookedOk: "اتحجزت. بعتنالك التفاصيل على الإيميل.",
    cancelNote: "تقدر تلغي المكالمة قبلها بـ 24 ساعة على الأقل.",
  },
};
let L = TXT.en, LOC = "en-US";
// Inside the phone apps nothing is sold: no prices, receipts or payment links.
const APP = /RepvoApp/.test(navigator.userAgent);
if (APP) document.documentElement.classList.add("in-app");
function setLang(lang) {
  const ar = lang === "ar";
  L = ar ? TXT.ar : TXT.en; LOC = ar ? "ar-EG-u-nu-latn" : "en-US";
  document.documentElement.lang = ar ? "ar" : "en";
  document.documentElement.dir = ar ? "rtl" : "ltr";
  const mp = document.getElementById("myplans"); if (mp) mp.textContent = ar ? "خططي" : "My plans";
  const ft = document.querySelector(".footin");
  if (ar && ft && !ft.dataset.ar) {
    ft.dataset.ar = "1";
    ft.innerHTML = '<span><b>Repvo</b> · اتمرّن صح. كُل صح.</span><span>الخطط إرشاد رياضي عام وليست نصيحة طبية.</span><span><a href="/terms">الشروط والاسترجاع والخصوصية</a></span>';
  }
}
function fmt(ts, tz, o) { try { return new Intl.DateTimeFormat(LOC, { timeZone: tz, ...o }).format(new Date(ts)); } catch { return new Date(ts).toUTCString(); } }
const tzName = tz => { try { return new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).format(new Date()).split(" ").pop(); } catch { return tz; } };
const ordinal = n => { if (LOC !== "en-US") return n; const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const api = async (url, opts = {}) => {
  const r = await fetch(url, { ...opts, headers: { "Content-Type": "application/json", ...(opts.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Something went wrong. Please try again.");
  return j;
};
const base = () => `/api/order/${encodeURIComponent(token)}`;
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const shiftISO = (iso, days) => { const [y, m, d] = iso.split("-").map(Number); const t = new Date(y, m - 1, d + days); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };
const niceDate = iso => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString(LOC, { weekday: "short", day: "numeric", month: "short" }); };

let O = null;            // the order as last loaded
let tab = "plan";        // plan | train | food | coach

let polls = 0;
async function load() {
  let o;
  try {
    const r = await fetch("/api/order/" + encodeURIComponent(token));
    if (r.status === 404) return render404();
    o = await r.json();
  } catch { root.innerHTML = `<div class="err">${L.loadErr}</div>`; return; }
  render(o);
  if (o.status === "pending" && !o.expired && !qs.get("cancelled") && polls < 60) { polls++; setTimeout(load, polls < 10 ? 2000 : 5000); }
}
function render404() {
  root.innerHTML = `<div class="panel sec"><h2>${L.notFound}</h2><p class="sub">${L.notFoundSub}</p><a class="btn" href="/#start">${L.getPlan}</a></div>`;
}

function receipt(o) {
  const cur = o.charge && o.charge.currency !== "USD" ? `<p class="note">${L.charged(esc(o.charge.currency), (o.charge.amount / 100).toLocaleString("en-US", { maximumFractionDigits: 2 }))}</p>` : "";
  return `<div class="cart">${o.lines.map(l => `<div class="line"><span>${esc((l.key === "pkg" ? L.labels[O && O.pkg] : L.labels[l.key]) || l.label)}</span><span class="p">${money(l.usd)}</span></div>`).join("")}
    <div class="tot"><span>${o.status === "paid" ? L.paid : L.total}</span><span class="big">${money(o.total)}</span></div>${cur}</div>`;
}
function extras(o) {
  let h = "";
  if (o.call) {
    const t = o.call.ts;
    h += `<div class="msg"><b>${L.callTitle}${o.call.status === "cancelled" ? L.cancelled : o.call.status === "done" ? L.done : ""}:</b> ${esc(fmt(t, userTZ, { weekday: "long", day: "numeric", month: "long" }))}, ${esc(fmt(t, userTZ, { hour: "numeric", minute: "2-digit" }))}–${esc(fmt(t + o.call.minutes * 60000, userTZ, { hour: "numeric", minute: "2-digit" }))} ${esc(tzName(userTZ))}. ${L.callOnWa(esc(o.contact.wa))}</div>`;
  }
  (o.calls || []).filter(c => c.status !== "cancelled").forEach(c => {
    h += `<div class="msg"><b>${L.callTitle}${c.status === "done" ? L.done : ""}:</b> ${esc(fmt(c.ts, userTZ, { weekday: "long", day: "numeric", month: "long" }))}, ${esc(fmt(c.ts, userTZ, { hour: "numeric", minute: "2-digit" }))}–${esc(fmt(c.ts + c.minutes * 60000, userTZ, { hour: "numeric", minute: "2-digit" }))} ${esc(tzName(userTZ))}. ${L.callOnWa(esc(o.contact.wa))}</div>`;
  });
  if (o.follow) {
    const f = o.follow;
    if (APP) { h += `<div class="msg">${f.status === "active" ? L.followOnApp : L.followOff(f.status)}</div>`; return h; }
    h += `<div class="msg">${f.status === "active" ? L.followOn(ordinal(f.anchor_day), money(f.price_usd), f.provider === "stripe", esc(fmt(f.next_charge_at, userTZ, { day: "numeric", month: "long", year: "numeric" }))) : L.followOff(f.status)}</div>`;
  }
  return h;
}

function render(o) {
  O = o;
  setLang(o.lang);
  document.title = o.kind === "renewal" ? L.titleRenewal : L.titlePlan;
  if (o.kind === "addon" && o.status === "paid" && o.parentToken) { location.replace(PLAN_URL(o.parentToken)); return; }
  if (o.status !== "paid") {
    const tryAgain = !o.expired && o.status === "pending";
    const head = qs.get("cancelled") ? L.payNot : o.expired || o.status !== "pending" ? L.expired : L.confirming;
    const sub = qs.get("cancelled") ? L.payNotSub : o.expired || o.status !== "pending" ? L.expiredSub : `<span class="spin"></span>${L.confirmingSub}`;
    const back = o.kind === "addon" && o.parentToken ? `<a class="btn ghost" href="${PLAN_URL(o.parentToken)}">${L.backPlan}</a>` : o.kind === "plan" ? `<a class="btn ghost" href="/#start">${tryAgain ? L.changeOrder : L.startAgain}</a>` : "";
    root.innerHTML = `<div class="panel sec"><h2>${head}</h2><p class="sub">${sub}</p>${receipt(o)}
      <div class="actions" style="margin-top:14px">${tryAgain && !APP ? `<a class="btn" href="/pay/${encodeURIComponent(token)}">${qs.get("cancelled") ? L.tryAgain : L.reopen}</a>` : ""}${back}</div></div>`;
    return;
  }
  if (o.kind === "renewal") {
    root.innerHTML = `<div class="panel sec rcpt"><h2>${L.renewed}</h2><p class="sub">${L.renewedSub(o.name ? esc(o.name.split(" ")[0]) : "")}</p>${receipt(o)}</div>`;
    return;
  }
  const first = (o.name || "").split(" ")[0];
  const f = o.features || [];
  const tabs = [["plan", L.tPlan]].concat(f.includes("train_log") ? [["train", L.tTrain]] : []).concat(f.includes("food_log") ? [["food", L.tFood]] : []).concat(o.follow ? [["coach", L.tCoach]] : []);
  if (!tabs.some(t => t[0] === tab)) tab = "plan";
  let html = `<div class="planhead"><div><p class="eyebrow">${L.order} ${esc(o.id)}</p><h1>${o.flagged ? L.yourCall : L.plansOf(first ? esc(first) : "")}</h1>
      <p>${L.paidOn(esc(L.labels[o.pkg] || o.pkgName), esc(fmt(o.paidAt, userTZ, { day: "numeric", month: "long", year: "numeric" })))} ${APP ? "" : L.bookmark}</p></div>
    <div class="actions">${o.flagged ? "" : `<button class="btn ghost noapp" type="button" id="print">${L.print}</button>`}</div></div>`;
  if (tabs.length > 1) html += `<div class="admtabs noprint" role="tablist" id="ptabs">${tabs.map(([k, l]) => `<button type="button" role="tab" data-t="${k}" aria-selected="${k === tab}">${l}</button>`).join("")}</div>`;
  html += `<div id="tabbody" style="display:flex;flex-direction:column;gap:20px"></div>`;
  root.innerHTML = html;
  const pr = $("print"); if (pr) pr.onclick = () => window.print();
  root.querySelectorAll("#ptabs button").forEach(b => b.onclick = () => { tab = b.dataset.t; render(O); });
  if (tab === "train") return renderTrain();
  if (tab === "food") return renderFood();
  if (tab === "coach") return renderCoach();
  renderPlanTab(o);
}

function renderPlanTab(o) {
  let html = "";
  if (o.flagged) {
    html += `<div class="panel sec"><h2>${L.flagTitle}</h2><p class="sub">${L.flagSub(esc(o.flags.join("; ")))}</p>${extras(o)}</div>`;
  } else if (extras(o)) html += `<div class="panel sec noprint" style="display:flex;flex-direction:column;gap:8px">${extras(o)}</div>`;
  if (o.plan) html += planHTML(o.plan);
  if (o.cardio) html += cardioHTML(o.cardio);
  if (o.supplements) html += suppHTML(o.supplements);
  if (o.upgrades && o.upgrades.length) {
    html += `<div class="panel sec noprint"><h2>${L.addTitle}</h2><p class="sub">${L.addSub}</p>
      <div class="two">${o.upgrades.map(u => `<div class="feat" style="display:flex;flex-direction:column;gap:10px"><h3 style="margin:0">${esc(L.labels[u.key] || u.label)} · ${u.recurring ? L.perMonth(money(u.usd)) : money(u.usd)}</h3><p>${esc(L.why[u.key] || "")}</p><button class="btn small" type="button" data-buy="${esc(u.key)}" style="align-self:flex-start">${u.slot ? L.pickTime : u.recurring ? L.startFor(money(u.usd)) : L.addFor(money(u.usd))}</button>${u.slot ? '<div class="slotbox" hidden></div>' : ""}</div>`).join("")}</div>
      <p class="note" id="buymsg"></p></div>`;
  }
  if (!APP) html += `<details class="panel sec noprint"><summary>${L.receipt}</summary><div style="margin-top:12px">${receipt(o)}<p class="note">${L.sentTo(esc(o.contact.email), esc(o.contact.wa))}</p></div></details>`;
  const body = $("tabbody");
  body.innerHTML = html;
  body.querySelectorAll(".swap").forEach(b => b.onclick = async () => {
    b.disabled = true;
    try {
      const r = await fetch(`/api/order/${encodeURIComponent(token)}/swap`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ meal: +b.dataset.m, role: b.dataset.r }) });
      if (r.ok) { const y = scrollY; render(await r.json()); scrollTo(0, y); } else b.disabled = false;
    } catch { b.disabled = false; }
  });
  const buy = async (key, slot, btn) => {
    btn.disabled = true; $("buymsg").textContent = "";
    try { const r = await api(base() + "/addon", { method: "POST", body: JSON.stringify({ feature: key, slot }) }); location.href = r.url; }
    catch (e) { $("buymsg").textContent = e.message; btn.disabled = false; }
  };
  body.querySelectorAll("[data-buy]").forEach(b => b.onclick = async () => {
    if (b.dataset.buy !== "call") return buy(b.dataset.buy, null, b);
    const sb = b.parentElement.querySelector(".slotbox");
    if (!sb.hidden) { sb.hidden = true; return; }
    sb.hidden = false; sb.innerHTML = '<p class="note"><span class="spin"></span></p>';
    let slots = [];
    try { slots = (await api("/api/slots")).filter(x => !x.taken && x.ts > Date.now() + 3600e3).slice(0, 40); } catch (e) { sb.innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
    if (!slots.length) { sb.innerHTML = `<p class="note">${L.noSlots}</p>`; return; }
    sb.innerHTML = `<label class="f">${L.chooseTime}<select>${slots.map(x => `<option value="${x.ts}">${esc(fmt(x.ts, userTZ, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }))}</option>`).join("")}</select></label>
      <p class="note">${esc(L.yourTime(tzName(userTZ)))}</p><div class="actrow"><button class="btn small" type="button" data-go>${L.bookPay}</button><button class="linkbtn" type="button" data-x>${L.cancelBtn}</button></div>`;
    sb.querySelector("[data-x]").onclick = () => { sb.hidden = true; };
    sb.querySelector("[data-go]").onclick = e => buy("call", Number(sb.querySelector("select").value), e.target);
  });
  // load a video only when its panel is opened
  body.querySelectorAll("details.howto").forEach(d => d.addEventListener("toggle", () => {
    const slot = d.querySelector("[data-src]");
    if (!d.open || !slot || slot.firstChild) return;
    if (slot.dataset.kind === "iframe") {
      const f = document.createElement("iframe");
      f.src = slot.dataset.src; f.title = slot.dataset.title || "Exercise video"; f.allow = "fullscreen; picture-in-picture"; f.allowFullscreen = true;
      f.loading = "lazy"; f.style.cssText = "width:100%;aspect-ratio:16/9;border:0;border-radius:8px;background:#000";
      slot.appendChild(f);
    } else {
      const v = document.createElement("video");
      v.src = slot.dataset.src; v.controls = true; v.playsInline = true; v.preload = "metadata";
      v.style.cssText = "width:100%;border-radius:8px;background:#000";
      slot.appendChild(v);
    }
  }));
}

function adjHTML(a) {
  if (!a) return "";
  return `<div class="adj"><b>${esc(L.adjTitle(a.areas.join(document.documentElement.lang === "ar" ? "، " : ", ")))}</b>
    ${a.swapped.length ? `<p>${L.adjSwap} ${a.swapped.map(([x, y]) => `${esc(x)} ${document.documentElement.lang === "ar" ? "←" : "→"} <b>${esc(y)}</b>`).join(" · ")}</p>` : ""}
    ${a.removed.length ? `<p>${L.adjOut} ${a.removed.map(esc).join(" · ")}</p>` : ""}
    <p class="note">${L.adjNote}</p></div>`;
}

function cardioHTML(c) {
  const z = { z2: "var(--pro)", z3: "var(--carb)", z5: "var(--fat)" };
  return `<div class="panel sec"><h2>${L.cardio}</h2><p class="sub">${L.cardioSub(c.hrMax)}</p>
    <p class="rk">${L.zonesT}</p>
    <div class="zones">${c.zones.map(x => `<div class="feat" style="border-top:4px solid ${z[x.key]}"><h3 style="margin:0 0 4px">${esc(x.name)}</h3><p class="zb" dir="ltr">${esc(x.bpm)} <small>${L.bpm}</small></p><p>${esc(x.feel)}</p></div>`).join("")}</div>
    <div class="two" style="margin-top:18px">
      <div class="day"><div class="hd"><b>${L.weekT}</b></div><table>${c.week.map(w => `<tr><td><b>${L.day} ${w.day}</b>${w.lift ? ` · ${esc(w.lift)}` : ""}</td><td class="cx">${w.cardio ? `${esc(w.cardio)}${w.after ? `<span class="rest">${esc(w.after)}</span>` : ""}` : `<span class="rest">${esc(w.rest)}</span>`}</td></tr>`).join("")}</table></div>
      <div class="day"><div class="hd"><b>${L.stepsT}</b></div><table>${c.steps.map((s, i) => `<tr><td>${L.wk(i + 1)}</td><td class="rx">${s.toLocaleString("en-US")} ${L.stepsU}</td></tr>`).join("")}</table></div>
    </div>
    <p class="rk" style="margin-top:18px">${L.sessionsT}</p>
    <div class="days">${c.sessions.map(s => `<div class="day" style="border-top:4px solid ${z[s.zone]}"><div class="hd"><b>${esc(s.name)}</b>${s.perWeek > 1 ? `<span>${L.perWeek(s.perWeek)}</span>` : ""}</div>
      <table>${s.weeks.map((w, i) => `<tr><td style="white-space:nowrap">${L.wk(i + 1)}</td><td>${esc(w)}</td></tr>`).join("")}</table>
      <p class="note" style="margin:8px 12px 12px">${L.options}: ${s.how.map(esc).join(" · ")}</p></div>`).join("")}</div>
    <ul class="sl" style="margin-top:16px">${c.notes.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>`;
}

function suppHTML(s) {
  return `<div class="panel sec"><h2>${L.supp}</h2><p class="sub">${L.suppSub}</p>
    <div class="two">${s.items.map(i => `<div class="feat"><h3 style="margin:0 0 6px">${esc(i.name)}</h3>
      <dl class="kv"><dt>${L.suppDose}</dt><dd><b>${esc(i.dose)}</b></dd><dt>${L.suppWhen}</dt><dd>${esc(i.when)}</dd></dl><p style="margin-top:8px">${esc(i.why)}</p></div>`).join("")}</div>
    <div class="two" style="margin-top:16px"><div><p class="rk">${L.suppSkip}</p><ul class="sl">${s.skip.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>
    <div><p class="rk">${L.suppNotes}</p><ul class="sl">${s.notes.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div></div></div>`;
}

function planHTML(p) {
  let html = "";
  if (p.targets) {
    const t = p.targets;
    html += `<div class="panel sec"><h2>${L.targets}</h2><p class="sub">${L.targetsSub}</p>
    <div class="targets">
      <div class="t kc"><div class="k">${L.kcal}</div><div class="v">${t.kcal}<small>${L.u_kcal}</small></div><div class="d">${t.adj ? L.vsMaint(Math.round(t.adj * 100)) : L.maint}</div></div>
      <div class="t p"><div class="k">${L.prot}</div><div class="v">${t.p}<small>${L.g}</small></div><div class="d">${L.gkg(t.ppk, t.protBase)}</div></div>
      <div class="t c"><div class="k">${L.carbs}</div><div class="v">${t.c}<small>${L.g}</small></div><div class="d">${L.rest}</div></div>
      <div class="t fa"><div class="k">${L.fat}</div><div class="v">${t.f}<small>${L.g}</small></div><div class="d">${L.ofKcal(Math.round(t.f * 9 / t.kcal * 100))}</div></div>
    </div>
    <div class="math" dir="ltr"><span>BMR <b>${t.bmr}</b> · ${esc(t.method)}</span><span>TDEE <b>${t.tdee}</b></span>${t.lbm ? `<span>${L.lean} <b>${t.lbm} kg</b></span>` : ""}</div></div>`;
    const bar = (lab, act, tg, col) => { const pct = tg ? act / tg * 100 : 0; return `<div class="bar"><span>${lab}</span><div class="tr"><div class="fl" style="width:${clamp(pct, 0, 100)}%;background:${col}"></div></div><span class="num">${Math.round(act)} / ${tg} · ${Math.round(pct)}%</span></div>`; };
    html += `<div class="panel sec"><h2>${L.meals}</h2><p class="sub">${L.mealsSub}</p>
      <div class="meals">${p.meals.map((m, i) => `<div class="meal"><h3>${esc(m.name)}<span>${m.kcal} ${L.u_kcal}</span></h3>
        ${m.items.map(it => `<div class="item"><span class="dot ${esc(it.cat)}"></span><span class="nm">${esc(it.name)}<span class="u">${esc(it.unit)}</span></span><span class="g">${it.g} ${L.g}${it.swappable ? `<button class="swap" type="button" data-m="${i}" data-r="${esc(it.role === "carb2" ? "carb" : it.role)}" aria-label="${esc(L.swapA(it.name))}">${L.swap}</button>` : ""}</span></div>`).join("") || `<p class="note">${L.noFoods}</p>`}
        <div class="mm"><span>P ${m.p} ${L.g}</span><span>C ${m.c} ${L.g}</span><span>F ${m.f} ${L.g}</span></div>
        ${m.recipe ? `<details class="recipe"><summary>${L.recipe} · ${esc(m.recipe.title)} · ${m.recipe.mins} ${L.min}</summary>
          <p class="rk">${L.ingredients}</p><ul>${m.recipe.ingredients.map(x => `<li>${esc(x)}</li>`).join("")}<li>${L.spices}</li></ul>
          <p class="rk">${L.steps}</p><ol>${m.recipe.steps.map(x => `<li>${esc(x)}</li>`).join("")}</ol></details>` : ""}</div>`).join("")}</div>
      <div class="bars">${bar(L.kcal, p.day.k, t.kcal, "var(--ink)")}${bar(L.prot, p.day.p, t.p, "var(--pro)")}${bar(L.carbs, p.day.c, t.c, "var(--carb)")}${bar(L.fat, p.day.f, t.f, "var(--fat)")}</div></div>`;
  }
  if (p.training) {
    html += `<div class="panel sec"><h2>${L.training}</h2><p class="sub">${L.trainingSub(p.trainingInfo.days, esc(p.trainingInfo.eq), esc(p.trainingInfo.split || ""))}</p>
    ${adjHTML(p.trainingInfo.adjust)}
    <div class="days">${p.training.map(d => `<div class="day"><div class="hd"><b>${L.day} ${d.n} · ${esc(d.name)}</b><span>${L.exercises(d.rows.length)}</span></div>
      <table>${d.rows.map(r => `<tr><td>${esc(r.ex)}${r.cues ? `<details class="howto noprint"><summary>${r.video ? L.watch : L.cues}</summary>
        ${r.video ? `<div data-kind="${esc(r.video.kind)}" data-src="${esc(r.video.src)}" data-title="${esc(r.ex)}"></div>` : `<p class="note">${L.soon}</p>`}
        <ul>${r.cues.map(c => `<li>${esc(c)}</li>`).join("")}</ul></details>` : ""}</td><td class="rx">${esc(r.txt)}<span class="rest">${L.restL} ${esc(r.rest)}</span></td></tr>`).join("")}</table>
      ${d.fin ? `<div class="fin">${esc(d.fin)}</div>` : ""}</div>`).join("")}</div>
    <div class="prog">${L.weeks.map(w => `<div class="wk"><b>${w[0]}</b>${w[1]}</div>`).join("")}</div></div>`;
  }
  return html;
}

/* ---------- training log ---------- */
let T = { day: 1, date: null, data: null };
const e1rm = (kg, reps) => (kg > 0 && reps > 0 ? kg * (1 + Math.min(reps, 12) / 30) : 0);
function spark(vals) {
  if (vals.length < 2) return "";
  const w = 90, h = 24, mn = Math.min(...vals), mx = Math.max(...vals), sp = mx - mn || 1;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1) * (w - 4) + 2).toFixed(1)},${(h - 3 - (v - mn) / sp * (h - 6)).toFixed(1)}`).join(" ");
  const last = pts.split(" ").pop().split(",");
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"></polyline><circle cx="${last[0]}" cy="${last[1]}" r="3" fill="var(--accent)"></circle></svg>`;
}
async function renderTrain() {
  const body = $("tabbody");
  if (!T.data) { body.innerHTML = `<p class="note"><span class="spin"></span></p>`; try { T.data = await api(base() + "/train"); } catch (e) { body.innerHTML = `<div class="err">${esc(e.message)}</div>`; return; } }
  if (!T.date) T.date = todayISO();
  const { days, sessions } = T.data;
  const d = days.find(x => x.n === T.day) || days[0];
  const disp = {}; days.forEach(x => x.rows.forEach(r => { disp[r.key || r.ex] = r.ex; }));
  const last = {}; // last sets per exercise for this training day
  for (const s of sessions) if (s.day_n === d.n) for (const e of s.data) if (!last[e.ex]) last[e.ex] = e.sets;
  const prog = {};
  for (const s of sessions.slice().reverse()) for (const e of s.data) {
    const best = Math.max(...e.sets.map(x => e1rm(x.kg || 0, x.reps)));
    const top = e.sets.reduce((a, x) => ((x.kg || 0) > (a.kg || 0) ? x : a), e.sets[0]);
    (prog[e.ex] = prog[e.ex] || []).push({ date: s.date, best, top });
  }
  body.innerHTML = `
  <div class="panel sec"><h2>${L.logTitle}</h2><p class="sub">${L.logSub}</p>
    <div class="toolbar"><label class="f">${L.trainingDay}<select id="tday">${days.map(x => `<option value="${x.n}" ${x.n === d.n ? "selected" : ""}>${L.day} ${x.n} · ${esc(x.name)}</option>`).join("")}</select></label>
      <label class="f">${L.date}<input type="date" id="tdate" value="${T.date}" max="${todayISO()}"></label></div>
    <div class="tablewrap"><table class="list"><thead><tr><th>${L.exercise}</th><th>${L.setsKgReps}</th></tr></thead><tbody>
      ${d.rows.map((r, ri) => `<tr><td style="min-width:150px">${esc(r.ex)}<br><span class="note">${esc(r.txt)}</span></td><td><div style="display:flex;flex-wrap:wrap;gap:8px" dir="ltr">${Array.from({ length: r.sets }, (_, si) => {
        const pv = (last[r.key || r.ex] || [])[si];
        return `<span style="display:inline-flex;align-items:center;gap:4px;font:500 12px var(--f-mono)"><input type="number" inputmode="decimal" step="0.5" min="0" max="500" data-r="${ri}" data-s="${si}" data-k="kg" placeholder="${pv && pv.kg !== null ? pv.kg : "kg"}" aria-label="${esc(r.ex)} set ${si + 1} kg" style="width:72px;padding:7px 8px">×<input type="number" inputmode="numeric" min="0" max="200" data-r="${ri}" data-s="${si}" data-k="reps" placeholder="${pv ? pv.reps : "reps"}" aria-label="${esc(r.ex)} set ${si + 1} reps" style="width:64px;padding:7px 8px"></span>`;
      }).join("")}</div></td></tr>`).join("")}
    </tbody></table></div>
    <div class="actions" style="margin-top:12px"><button class="btn" type="button" id="tsave">${L.save}</button><span class="note" id="tmsg"></span></div>
  </div>
  <div class="panel sec"><h2>${L.progress}</h2><p class="sub">${L.progressSub}</p>
    ${Object.keys(prog).length ? `<div class="tablewrap"><table class="list"><thead><tr><th>${L.exercise}</th><th>${L.lastTop}</th><th>${L.best1rm}</th><th>${L.change}</th><th>${L.trend}</th></tr></thead><tbody>${Object.entries(prog).map(([ex, arr]) => {
      const bests = arr.map(a => a.best).filter(Boolean), lastA = arr[arr.length - 1];
      const ch = bests.length > 1 ? bests[bests.length - 1] - bests[0] : 0;
      return `<tr><td>${esc(disp[ex] || ex)}</td><td class="num" dir="ltr">${lastA.top.kg ? lastA.top.kg + " kg × " : ""}${lastA.top.reps}</td><td class="num" dir="ltr">${bests.length ? Math.round(Math.max(...bests) * 10) / 10 + " kg" : "–"}</td>
        <td class="num" dir="ltr" style="color:${ch > 0 ? "var(--ok)" : ch < 0 ? "var(--bad)" : "var(--muted)"}">${bests.length > 1 ? (ch > 0 ? "+" : "") + Math.round(ch * 10) / 10 + " kg" : "–"}</td><td>${spark(bests)}</td></tr>`;
    }).join("")}</tbody></table></div>` : `<p class="note">${L.firstSession}</p>`}</div>
  <div class="panel sec"><h2>${L.history}</h2>
    ${sessions.length ? `<div class="tablewrap"><table class="list"><thead><tr><th>${L.date}</th><th>${L.session}</th><th>${L.sets}</th><th>${L.volume}</th><th></th></tr></thead><tbody>${sessions.map(s => {
      const nm = (days.find(x => x.n === s.day_n) || {}).name || "";
      const sets = s.data.reduce((a, e) => a + e.sets.length, 0);
      const vol = s.data.reduce((a, e) => a + e.sets.reduce((b, x) => b + (x.kg || 0) * x.reps, 0), 0);
      return `<tr><td class="num">${esc(niceDate(s.date))}</td><td>${L.day} ${s.day_n} · ${esc(nm)}</td><td class="num">${sets}</td><td class="num" dir="ltr">${Math.round(vol).toLocaleString("en-US")} kg</td><td><button class="del" type="button" data-del="${s.id}">${L.del}</button></td></tr>`;
    }).join("")}</tbody></table></div>` : `<p class="note">${L.noSessions}</p>`}</div>`;
  $("tday").onchange = e => { T.day = +e.target.value; renderTrain(); };
  $("tdate").onchange = e => { T.date = e.target.value || todayISO(); };
  $("tsave").onclick = async () => {
    const entries = d.rows.map((r, ri) => ({ ex: r.key || r.ex, sets: Array.from({ length: r.sets }, (_, si) => {
      const kg = body.querySelector(`[data-r="${ri}"][data-s="${si}"][data-k="kg"]`).value, reps = body.querySelector(`[data-r="${ri}"][data-s="${si}"][data-k="reps"]`).value;
      return { kg: kg === "" ? null : +kg, reps: reps === "" ? null : +reps };
    }).filter(x => x.reps) })).filter(e => e.sets.length);
    if (!entries.length) { $("tmsg").textContent = L.needReps; return; }
    $("tsave").disabled = true;
    try { await api(base() + "/train", { method: "POST", body: JSON.stringify({ day: d.n, date: T.date, entries }) }); T.data = null; await renderTrain(); $("tmsg").textContent = L.saved; }
    catch (e) { $("tmsg").textContent = e.message; $("tsave").disabled = false; }
  };
  body.querySelectorAll("[data-del]").forEach(b => b.onclick = async () => {
    if (b.dataset.sure !== "1") { b.dataset.sure = "1"; b.textContent = L.delSure; return; }
    try { await api(base() + "/train/" + b.dataset.del, { method: "DELETE" }); T.data = null; renderTrain(); } catch (e) { b.textContent = e.message; }
  });
}

/* ---------- food log ---------- */
let F = { date: null, day: null, foods: null, pick: null, q: "" };
async function renderFood() {
  const body = $("tabbody");
  if (!F.date) F.date = todayISO();
  if (!F.day || F.day.date !== F.date) {
    body.innerHTML = `<p class="note"><span class="spin"></span></p>`;
    try { F.day = await api(base() + "/food?date=" + F.date); if (!F.foods) F.foods = await api(base() + "/foods"); }
    catch (e) { body.innerHTML = `<div class="err">${esc(e.message)}</div>`; return; }
  }
  const { targets: t, entries, history, meals } = F.day;
  const tot = entries.reduce((a, e) => ({ k: a.k + e.kcal, p: a.p + e.p, c: a.c + e.c, f: a.f + e.f }), { k: 0, p: 0, c: 0, f: 0 });
  const bar = (lab, act, tg, col) => { const pct = tg ? act / tg * 100 : 0; return `<div class="bar"><span>${lab}</span><div class="tr"><div class="fl" style="width:${clamp(pct, 0, 100)}%;background:${pct > 110 ? "var(--bad)" : col}"></div></div><span class="num">${Math.round(act)} / ${tg} · ${Math.round(pct)}%</span></div>`; };
  const left = Math.round(t.kcal - tot.k);
  const q = F.q.trim().toLowerCase();
  const matches = q.length >= 2 ? F.foods.filter(f => f.name.toLowerCase().includes(q) || (f.en || "").toLowerCase().includes(q)).slice(0, 8) : [];
  const hmax = Math.max(t.kcal * 1.3, ...history.map(h => h.kcal));
  const rtl = document.documentElement.dir === "rtl";
  body.innerHTML = `
  <div class="panel sec">
    <div class="toolbar" style="justify-content:space-between"><div style="display:flex;gap:8px;align-items:center"><button class="btn ghost small" type="button" id="fprev" aria-label="${L.prev}">${rtl ? "›" : "‹"}</button><b style="font-family:var(--f-display);font-size:22px;text-transform:uppercase">${esc(niceDate(F.date))}</b><button class="btn ghost small" type="button" id="fnext" aria-label="${L.next}" ${F.date >= todayISO() ? "disabled" : ""}>${rtl ? "‹" : "›"}</button></div>
      <span class="note">${left >= 0 ? L.left(left) : L.over(-left)}</span></div>
    <div class="bars">${bar(L.kcal, tot.k, t.kcal, "var(--ink)")}${bar(L.prot, tot.p, t.p, "var(--pro)")}${bar(L.carbs, tot.c, t.c, "var(--carb)")}${bar(L.fat, tot.f, t.f, "var(--fat)")}</div>
  </div>
  <div class="panel sec"><h2>${L.addFood}</h2>
    ${meals.length ? `<p class="hint">${L.ateMeal}</p><div style="display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 14px">${meals.map(m => `<button class="btn ghost small" type="button" data-meal="${m.i}">${esc(m.name)} · ${m.kcal} ${L.u_kcal}</button>`).join("")}</div>` : ""}
    <label class="f">${L.search(F.foods.length)}<input type="text" id="fq" value="${esc(F.q)}" placeholder="${esc(L.searchPh)}" autocomplete="off"></label>
    ${matches.length ? `<div style="display:flex;flex-direction:column;gap:4px;margin-top:8px">${matches.map(f => `<button type="button" class="addon" data-pick="${esc(f.id)}" style="text-align:start;background:${F.pick && F.pick.id === f.id ? "var(--soft)" : "transparent"};color:var(--ink);font:inherit"><span class="tx"><b>${esc(f.name)}</b><small dir="ltr">${f.kcal} kcal · P ${f.p} · C ${f.c} · F ${f.f} · ${esc(L.per100)}</small></span></button>`).join("")}</div>` : q.length >= 2 ? `<p class="note">${L.noMatch}</p>` : ""}
    ${F.pick ? `<div class="toolbar" style="margin-top:10px"><label class="f">${esc(L.gramsOf(F.pick.name))}<input type="number" id="fg" min="1" max="3000" value="${F.pick.unitG || 100}"></label>${F.pick.unitG ? `<span class="note">${esc(L.unitIs(F.pick.unit, F.pick.unitG))}</span>` : ""}<button class="btn" type="button" id="fadd">${L.add}</button></div>` : ""}
    <details style="margin-top:12px"><summary>${L.custom}</summary>
      <div class="formgrid" style="margin-top:10px"><label class="f">${L.name}<input type="text" id="cn" maxlength="80"></label><label class="f">${L.kcal}<input type="number" id="ck" min="0" max="5000"></label>
      <label class="f">${L.prot} (${L.g})<input type="number" id="cp" min="0"></label><label class="f">${L.carbs} (${L.g})<input type="number" id="cc" min="0"></label><label class="f">${L.fat} (${L.g})<input type="number" id="cf" min="0"></label></div>
      <button class="btn small" type="button" id="cadd" style="margin-top:10px">${L.add}</button></details>
    <p class="note" id="fmsg"></p>
  </div>
  <div class="panel sec"><h2>${L.eaten}</h2>
    ${entries.length ? `<div class="tablewrap"><table class="list"><thead><tr><th>${L.food}</th><th>${L.amount}</th><th>${L.u_kcal}</th><th>P</th><th>C</th><th>F</th><th></th></tr></thead><tbody>${entries.map(e => `<tr><td>${esc(e.name)}${e.meal ? `<br><span class="note">${esc(e.meal)}</span>` : ""}</td><td class="num">${e.grams ? Math.round(e.grams) + " " + L.g : "–"}</td><td class="num">${Math.round(e.kcal)}</td><td class="num">${Math.round(e.p)}</td><td class="num">${Math.round(e.c)}</td><td class="num">${Math.round(e.f)}</td><td><button class="del" type="button" data-fdel="${e.id}">${L.remove}</button></td></tr>`).join("")}</tbody></table></div>` : `<p class="note">${L.nothing}</p>`}
  </div>
  ${history.length ? `<div class="panel sec"><h2>${L.lastDays(history.length)}</h2><p class="sub">${L.vsTarget(t.kcal)}</p>
    <div style="position:relative;display:flex;align-items:flex-end;justify-content:flex-end;gap:6px;height:120px;border-bottom:1px solid var(--line)" dir="ltr">
      <div style="position:absolute;left:0;right:0;bottom:${t.kcal / hmax * 100}%;border-top:2px dashed var(--muted)" aria-hidden="true"></div>
      ${history.map(h => `<div title="${esc(h.date)}: ${h.kcal} kcal" style="flex:1;min-width:0;max-width:48px;height:${Math.max(2, h.kcal / hmax * 100)}%;background:${Math.abs(h.kcal - t.kcal) / t.kcal <= 0.1 ? "var(--ok)" : "var(--carb)"};border-radius:3px 3px 0 0"></div>`).join("")}
    </div><div style="display:flex;justify-content:flex-end;gap:6px;font:500 10px var(--f-mono);color:var(--muted);margin-top:4px" dir="ltr">${history.map(h => `<span style="flex:1;min-width:0;max-width:48px;text-align:center;overflow:hidden">${h.date.slice(8)}</span>`).join("")}</div>
    <p class="note">${L.green}</p></div>` : ""}`;
  const reload = async () => { F.day = null; await renderFood(); };
  $("fprev").onclick = () => { F.date = shiftISO(F.date, -1); renderFood(); };
  $("fnext").onclick = () => { F.date = shiftISO(F.date, 1); renderFood(); };
  const fq = $("fq");
  fq.oninput = () => { F.q = fq.value; F.pick = null; const pos = fq.selectionStart; renderFood().then(() => { const n = $("fq"); n.focus(); n.setSelectionRange(pos, pos); }); };
  body.querySelectorAll("[data-pick]").forEach(b => b.onclick = () => { F.pick = F.foods.find(f => f.id === b.dataset.pick); renderFood().then(() => $("fg") && $("fg").focus()); });
  const add = async payload => {
    try { await api(base() + "/food", { method: "POST", body: JSON.stringify({ date: F.date, ...payload }) }); F.pick = null; F.q = ""; await reload(); }
    catch (e) { $("fmsg").textContent = e.message; }
  };
  if ($("fadd")) $("fadd").onclick = () => add({ foodId: F.pick.id, grams: +$("fg").value });
  $("cadd").onclick = () => add({ name: $("cn").value, kcal: $("ck").value === "" ? null : +$("ck").value, p: +$("cp").value || 0, c: +$("cc").value || 0, f: +$("cf").value || 0 });
  body.querySelectorAll("[data-meal]").forEach(b => b.onclick = () => add({ meal: +b.dataset.meal }));
  body.querySelectorAll("[data-fdel]").forEach(b => b.onclick = async () => { try { await api(base() + "/food/" + b.dataset.fdel, { method: "DELETE" }); await reload(); } catch (e) { b.textContent = e.message; } });
}

/* ---------- weekly calls (coach follow-up) ---------- */
let W = { data: null, day: null, pick: null, msg: "" };
async function renderCoach() {
  const body = $("tabbody");
  if (!W.data) { body.innerHTML = `<p class="note"><span class="spin"></span></p>`; try { W.data = await api(base() + "/weekly"); } catch (e) { body.innerHTML = `<div class="err">${esc(e.message)}</div>`; return; } }
  const w = W.data;
  const dayKey = ts => new Intl.DateTimeFormat("en-CA", { timeZone: userTZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ts));
  const groups = new Map(); w.slots.forEach(s => { const k = dayKey(s.ts); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s); });
  const keys = [...groups.keys()];
  if (!W.day || !groups.has(W.day)) W.day = keys.find(k => groups.get(k).some(s => !s.taken && !s.weekUsed)) || keys[0];
  const tm = ts => fmt(ts, userTZ, { hour: "numeric", minute: "2-digit" });
  body.innerHTML = `
  <div class="panel sec"><h2>${L.coachTitle}</h2><p class="sub">${L.coachSub(w.minutes)}</p>
    ${!w.active ? `<div class="warnbox">${L.coachInactive}</div>` : `
    <p class="note">${L.coachUntil(esc(fmt(w.until, userTZ, { day: "numeric", month: "long" })))}</p>
    ${keys.length ? `<div class="dates" style="margin-top:12px">${keys.map(k => { const ts = groups.get(k)[0].ts; const free = groups.get(k).some(s => !s.taken && !s.weekUsed);
      return `<button type="button" class="dt" data-k="${k}" aria-pressed="${k === W.day}" ${free ? "" : "disabled"}><span>${esc(fmt(ts, userTZ, { weekday: "short" }))}</span><b>${esc(fmt(ts, userTZ, { day: "numeric" }))}</b><span>${esc(fmt(ts, userTZ, { month: "short" }))}</span></button>`; }).join("")}</div>
    <div class="times" style="margin-top:10px">${(groups.get(W.day) || []).map(s => `<button type="button" class="tm" data-ts="${s.ts}" aria-pressed="${s.ts === W.pick}" ${s.taken || s.weekUsed ? "disabled" : ""}>${esc(tm(s.ts))}${s.taken ? `<small>${L.booked}</small>` : s.weekUsed ? `<small>${L.weekUsed}</small>` : ""}</button>`).join("")}</div>
    <div class="actions" style="margin-top:12px"><button class="btn" type="button" id="wbook" ${W.pick ? "" : "disabled"}>${W.pick ? `${L.book} · ${esc(fmt(W.pick, userTZ, { weekday: "short", day: "numeric", month: "short" }))} ${esc(tm(W.pick))}` : L.pickTime}</button><span class="note" id="wmsg">${esc(W.msg)}</span></div>` : ""}`}
  </div>
  <div class="panel sec"><h2>${L.upcoming}</h2>
    ${w.booked.length ? `<div class="tablewrap"><table class="list"><tbody>${w.booked.map(b => `<tr><td>${esc(fmt(b.ts, userTZ, { weekday: "long", day: "numeric", month: "long" }))}</td><td class="num">${esc(tm(b.ts))}–${esc(tm(b.ts + w.minutes * 60000))} ${esc(tzName(userTZ))}</td><td>${b.canCancel ? `<button class="del" type="button" data-wc="${b.id}">${L.cancelCall}</button>` : ""}</td></tr>`).join("")}</tbody></table></div><p class="note">${L.cancelNote}</p>` : `<p class="note">${L.noCalls}</p>`}
  </div>`;
  body.querySelectorAll(".dt").forEach(b => b.onclick = () => { W.day = b.dataset.k; W.pick = null; renderCoach(); });
  body.querySelectorAll(".tm").forEach(b => b.onclick = () => { W.pick = +b.dataset.ts; renderCoach(); });
  const bk = $("wbook"); if (bk) bk.onclick = async () => {
    bk.disabled = true;
    try { await api(base() + "/weekly", { method: "POST", body: JSON.stringify({ slot: W.pick }) }); W = { data: null, day: null, pick: null, msg: L.bookedOk }; renderCoach(); }
    catch (e) { W.msg = e.message; W.data = null; W.pick = null; renderCoach(); }
  };
  body.querySelectorAll("[data-wc]").forEach(b => b.onclick = async () => {
    if (b.dataset.sure !== "1") { b.dataset.sure = "1"; b.textContent = L.delSure; return; }
    try { await api(base() + "/weekly/" + b.dataset.wc, { method: "DELETE" }); W = { data: null, day: null, pick: null, msg: "" }; renderCoach(); } catch (e) { b.textContent = e.message; }
  });
}

load();
})();
