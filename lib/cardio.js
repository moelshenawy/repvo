// Personal cardio plan (paid add-on). Built from the intake: goal, age, weight,
// height, level, equipment and the lifting split, so cardio sits around the
// weight sessions instead of fighting them. Heart-rate zones from the Tanaka
// formula (208 - 0.7 x age) plus a talk test for people without a watch.
// 4-week progression to match the training plan. English and Arabic.

const LIFT_DAYS = { 2: [1, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5], 6: [1, 2, 3, 4, 5, 6] };
const LEG_DAYS = new Set(["Legs", "Lower", "Lower A", "Lower B"]);

const TXT = {
  en: {
    zones: { z2: ["Zone 2 · easy", "You can talk in full sentences. Breathing a bit faster, nose breathing still possible."],
             z3: ["Zone 3 · tempo", "Comfortably hard. You can say short phrases, not full sentences."],
             z5: ["Hard intervals", "Very hard. Only a word or two. You couldn't keep this pace for more than a few minutes."] },
    names: { z2: "Easy cardio (zone 2)", long: "Long easy cardio (zone 2)", tempo: "Tempo cardio (zone 3)", hiit: "Intervals", vo2: "4 × 4 intervals" },
    min: n => `${n} min`,
    hiit: (r, on, off, tot) => `Warm up 5 min · ${r} rounds of ${on} s hard / ${off} s easy · cool down 5 min (about ${tot} min)`,
    vo2: (r, tot) => `Warm up 8 min · ${r} rounds of 4 min hard / 3 min easy · cool down 5 min (about ${tot} min)`,
    tempo: n => `Warm up 5 min · ${n} min steady at tempo · cool down 5 min`,
    gym: { easy: ["Incline treadmill walk", "Stationary bike", "Elliptical", "Rowing machine"], hard: ["Stationary bike", "Rowing machine", "Treadmill run"], hardLow: ["Stationary bike", "Rowing machine", "Steep incline treadmill walk"] },
    home: { easy: ["Brisk outdoor walk", "Cycling", "Easy jog", "Stair climbing"], easyLow: ["Brisk outdoor walk", "Cycling", "Swimming"], hard: ["Hill or stair sprints", "Jump rope", "Running intervals"], hardLow: ["Fast uphill walk", "Step-ups on a stair", "Cycling sprints"] },
    rest: "Rest", after: "after lifting", only: "",
    notes: {
      order: "Do cardio after your weights or on a separate day. Never do hard cardio right before a leg day.",
      talk: "No heart-rate watch? Use the talk test next to each zone; it works just as well.",
      steps: "Steps add up through the day. Walking to work, shopping and phone calls on foot all count.",
      loss: "Cardio speeds things up, but your calorie target does most of the fat-loss work. Don't eat back what the machine says you burned.",
      gain: "Cardio stays easy and short so it doesn't take from muscle gain. If your weight stalls, eat a little more on cardio days.",
      recomp: "Keep the easy sessions easy. The one harder session each week is where fitness improves.",
      perf: "The 4 × 4 intervals build your engine (VO2 max). Give them full effort and keep everything else easy.",
      low: "We chose low-impact options to protect your knees and joints. Add running only after a few weeks of regular walking.",
      safety: "Stop and get checked if you feel chest pain, dizziness or unusual shortness of breath.",
    },
  },
  ar: {
    zones: { z2: ["المنطقة 2 · سهل", "تقدر تتكلم بجمل كاملة. نفَسك أسرع شوية، ولسه تقدر تتنفس من مناخيرك."],
             z3: ["المنطقة 3 · متوسط (تيمبو)", "صعب بس مريح. تقدر تقول كلمتين تلاتة، مش جمل كاملة."],
             z5: ["إنترفال صعب", "صعب جدًا. كلمة أو اتنين بالعافية. مش هتقدر تكمل بالسرعة دي أكتر من دقايق."] },
    names: { z2: "كارديو سهل (المنطقة 2)", long: "كارديو سهل طويل (المنطقة 2)", tempo: "كارديو تيمبو (المنطقة 3)", hiit: "إنترفال", vo2: "إنترفال 4 × 4" },
    min: n => `${n} دقيقة`,
    hiit: (r, on, off, tot) => `إحماء 5 د · ${r} جولات ${on} ث صعب / ${off} ث سهل · تهدئة 5 د (حوالي ${tot} د)`,
    vo2: (r, tot) => `إحماء 8 د · ${r} جولات 4 د صعب / 3 د سهل · تهدئة 5 د (حوالي ${tot} د)`,
    tempo: n => `إحماء 5 د · ${n} د ثابت على التيمبو · تهدئة 5 د`,
    gym: { easy: ["مشي على المشاية بميل", "عجلة ثابتة", "إليبتيكال", "جهاز التجديف"], hard: ["عجلة ثابتة", "جهاز التجديف", "جري على المشاية"], hardLow: ["عجلة ثابتة", "جهاز التجديف", "مشي على مشاية بميل عالي"] },
    home: { easy: ["مشي سريع برّه", "عجلة", "جري خفيف", "طلوع سلالم"], easyLow: ["مشي سريع برّه", "عجلة", "سباحة"], hard: ["سبرنت على طلعة أو سلالم", "نط حبل", "إنترفال جري"], hardLow: ["مشي سريع على طلعة", "طلوع ونزول على سلمة", "سبرنت بالعجلة"] },
    rest: "راحة", after: "بعد الحديد", only: "",
    notes: {
      order: "اعمل الكارديو بعد الحديد أو في يوم لوحده. ماتعملش كارديو صعب قبل يوم الرجل على طول.",
      talk: "مفيش ساعة بتقيس النبض؟ استخدم اختبار الكلام اللي جنب كل منطقة؛ بيشتغل بنفس الكفاءة.",
      steps: "الخطوات بتتجمع طول اليوم. المشي للشغل والمشاوير والمكالمات وأنت ماشي كلها بتتحسب.",
      loss: "الكارديو بيسرّع النتيجة، بس هدف السعرات هو اللي بيعمل أغلب شغل حرق الدهون. ماتاكلش تاني السعرات اللي الجهاز بيقول إنك حرقتها.",
      gain: "الكارديو سهل وقصير عشان مايقللش من زيادة العضل. لو وزنك وقف، كُل شوية زيادة في أيام الكارديو.",
      recomp: "خلي الحصص السهلة سهلة فعلًا. الحصة الصعبة الوحيدة في الأسبوع هي اللي بتحسّن لياقتك.",
      perf: "إنترفال 4 × 4 بيبني الموتور بتاعك (VO2 max). اديها كل مجهودك وخلي الباقي سهل.",
      low: "اخترنا تمارين قليلة الضغط عشان نحمي ركبك ومفاصلك. ضيف الجري بس بعد كام أسبوع من المشي المنتظم.",
      safety: "وقّف واكشف لو حسيت بألم في الصدر أو دوخة أو نهجان مش طبيعي.",
    },
  },
};

function cardioPlan(intake, splitNames, lang) {
  const L = TXT[lang === "ar" ? "ar" : "en"];
  const age = intake.age, goal = intake.goal, lvl = intake.lvl;
  const hrMax = Math.round(208 - 0.7 * age);
  const bpm = (a, b) => `${Math.round(hrMax * a)}–${Math.round(hrMax * b)}`;
  const bmi = intake.wt / Math.pow(intake.ht / 100, 2);
  const low = bmi >= 30 || age >= 50 || (intake.injuries || []).some(k => ["knee", "hip", "ankle", "lowback"].includes(k));
  const beg = lvl === "beg", adv = lvl === "adv";

  const zones = [
    { key: "z2", name: L.zones.z2[0], bpm: bpm(0.6, 0.7), feel: L.zones.z2[1] },
    { key: "z3", name: L.zones.z3[0], bpm: bpm(0.7, 0.8), feel: L.zones.z3[1] },
    { key: "z5", name: L.zones.z5[0], bpm: bpm(0.85, 0.92), feel: L.zones.z5[1] },
  ];

  const gym = intake.eq === 0;
  const M = gym ? L.gym : L.home;
  const easyHow = gym ? M.easy : (low ? M.easyLow : M.easy);
  const hardHow = low ? M.hardLow : M.hard;

  const z2 = (key, mins) => ({ key, name: L.names[key], zone: "z2", weeks: mins.map(L.min), how: easyHow, hard: false });
  const tempo = mins => ({ key: "tempo", name: L.names.tempo, zone: "z3", weeks: mins.map(L.tempo), how: hardHow, hard: true });
  const hiit = (rounds, on, off) => ({ key: "hiit", name: L.names.hiit, zone: "z5", weeks: rounds.map(r => L.hiit(r, on, off, 10 + Math.round(r * (on + off) / 60))), how: hardHow, hard: true });
  const vo2 = rounds => ({ key: "vo2", name: L.names.vo2, zone: "z5", weeks: rounds.map(r => L.vo2(r, 10 + r * 7)), how: hardHow, hard: true });

  const sessions = [];
  let steps;
  if (goal === "loss") {
    steps = [8000, 8500, 9000, 10000];
    const m = beg ? [25, 30, 35, 35] : [30, 35, 40, 45];
    sessions.push(z2("z2", m), z2("z2", m));
    sessions.push(beg ? tempo([12, 15, 18, 18]) : adv ? hiit([8, 9, 10, 10], 30, 60) : hiit([6, 7, 8, 8], 30, 90));
    if (adv) sessions.push(z2("long", [40, 45, 50, 50]));
  } else if (goal === "gain") {
    steps = [6000, 6500, 7000, 7500];
    sessions.push(z2("z2", [20, 20, 25, 25]), z2("z2", [20, 20, 25, 25]));
  } else if (goal === "recomp") {
    steps = [7000, 7500, 8000, 9000];
    sessions.push(z2("z2", beg ? [20, 25, 30, 30] : [25, 30, 35, 35]), z2("z2", beg ? [20, 25, 30, 30] : [25, 30, 35, 35]));
    sessions.push(beg ? tempo([10, 12, 15, 15]) : hiit([6, 7, 8, 8], 30, 90));
  } else {
    steps = [7000, 7500, 8000, 9000];
    sessions.push(z2("long", beg ? [25, 30, 35, 35] : [35, 40, 45, 45]));
    sessions.push(beg ? tempo([12, 15, 18, 18]) : vo2([3, 4, 4, 5]));
    if (!beg) sessions.push(tempo([15, 18, 20, 20]));
  }

  // place sessions around the lifting days: hard ones first, never the day before a leg day
  const lifts = intake.pkg === "nutrition" ? [] : (LIFT_DAYS[intake.days] || []);
  const liftName = {}; lifts.forEach((d, i) => { liftName[d] = (splitNames || [])[i] || ""; });
  const isLeg = d => LEG_DAYS.has(liftName[d]);
  const used = new Set();
  const week = [];
  const free = [7, 3, 6, 2, 5, 4, 1].filter(d => !lifts.includes(d));
  const slot = {};
  const pick = s => {
    const next = d => (d % 7) + 1;
    const okHard = d => !(s.hard && isLeg(next(d)));
    let d = free.find(x => !used.has(x) && okHard(x));
    let when = "";
    if (!d) {
      const lf = lifts.filter(x => !used.has(x) && okHard(x) && !(s.hard && isLeg(x)));
      d = lf.find(x => !isLeg(x)) || lf[0];
      when = "after";
    }
    if (!d) { d = [1, 2, 3, 4, 5, 6, 7].find(x => !used.has(x)); when = lifts.includes(d) ? "after" : ""; }
    used.add(d); slot[d] = { name: s.name, when };
  };
  sessions.filter(s => s.hard).forEach(pick);
  sessions.filter(s => !s.hard).forEach(pick);
  for (let d = 1; d <= 7; d++) {
    const lift = liftName[d] || "";
    week.push({ day: d, lift, cardio: slot[d] ? slot[d].name : "", after: slot[d] && slot[d].when === "after" ? L.after : "", rest: !lift && !slot[d] ? L.rest : "" });
  }

  const N = L.notes;
  const notes = [N.order, N.talk, N[goal], N.steps];
  if (low) notes.push(N.low);
  notes.push(N.safety);

  // identical sessions are shown once with how many times a week
  const grouped = [];
  sessions.forEach(({ hard, ...s }) => {
    const same = grouped.find(g => g.key === s.key && g.weeks.join() === s.weeks.join());
    if (same) same.perWeek++; else grouped.push({ ...s, perWeek: 1 });
  });
  return { hrMax, zones, steps, sessions: grouped, week, notes, lowImpact: low };
}

if (typeof module !== "undefined" && module.exports) module.exports = { cardioPlan }; else window.CARDIO = { cardioPlan };
