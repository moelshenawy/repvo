// Plan engine: the same math as the prototype, run on the server so the plan
// only exists after payment.

const NODE = typeof module !== "undefined" && typeof require === "function";
const { FOOD_ROWS, EX_CUES, EX_VIDEOS } = NODE ? require("./foods") : window.FOOD_DATA;
const { AR_FOODS, AR_UNITS, AR_MEALS, AR_DAYS, AR_EX, AR_TEXT } = NODE ? require("./ar") : window.AR_DATA;
const STARTER_FOODS = FOOD_ROWS.map((r, i) => ({ id: "f" + i, name: r[0], cat: r[1], kcal: r[2], p: r[3], c: r[4], f: r[5], slots: r[6], unit: r[7], unitG: r[8], reg: r[9] || "all", style: r[10] || "any", mins: r[11] || 0, prep: r[12] || "",
  nameAr: (AR_FOODS[r[0]] || [])[0] || "", prepAr: (AR_FOODS[r[0]] || [])[1] || "" }));
// a food's name and recipe step in the program language (falls back to English)
const fName = (f, ar) => (ar && (f.nameAr || (AR_FOODS[f.name] || [])[0])) || f.name;
const fPrep = (f, ar) => (ar ? f.prepAr || (AR_FOODS[f.name] || [])[1] || f.prep : f.prep) || "";

const CATS = ["protein", "carb", "fruit", "fat", "veg", "other"];
const STYLES = ["any", "savory", "sweet"];
// Answers that send the client to a coach instead of an automatic plan.
const FLAGS = {
  heart: "Heart condition, or chest pain during exercise",
  dizzy: "Dizziness or fainting during exercise",
  bp: "High blood pressure that isn't under control",
  preg: "Pregnant, or gave birth in the last 6 months",
  diab: "Diabetes or on insulin",
  kidney: "Kidney or liver disease",
  injury: "Surgery or a serious injury in the last 6 months",
};
// Pain or old injuries: the plan is still automatic, but exercises that load the area are swapped or left out.
const AREAS = {
  en: { neck: "neck", shoulder: "shoulder", elbow: "elbow", wrist: "wrist", lowback: "lower back", hip: "hip", knee: "knee", ankle: "ankle" },
  ar: { neck: "الرقبة", shoulder: "الكتف", elbow: "الكوع", wrist: "الرسغ", lowback: "أسفل الظهر", hip: "الحوض", knee: "الركبة", ankle: "الكاحل" },
};
// Which areas each exercise loads. Exercises not listed are easy on all of them.
const STRESS = {
  "Barbell back squat": ["knee", "lowback", "hip"], "Goblet squat": ["knee", "hip"], "Tempo bodyweight squat (3 s down)": ["knee"],
  "Romanian deadlift": ["lowback", "hip"], "Dumbbell Romanian deadlift": ["lowback", "hip"],
  "Leg press": ["knee", "hip"], "Dumbbell walking lunge": ["knee", "hip", "ankle"], "Bulgarian split squat": ["knee", "hip", "ankle"],
  "Barbell bench press": ["shoulder", "wrist", "elbow"], "Dumbbell floor press": ["elbow"], "Push-up": ["shoulder", "wrist"],
  "Incline dumbbell press": ["shoulder"], "Incline dumbbell press (on a step)": ["shoulder"], "Feet-elevated push-up": ["shoulder", "wrist"],
  "Seated dumbbell shoulder press": ["shoulder", "neck"], "Standing dumbbell press": ["shoulder", "lowback", "neck"], "Pike push-up": ["shoulder", "wrist", "neck"],
  "Lat pulldown": ["shoulder"], "Dumbbell pullover": ["shoulder"], "Pull-up or door-frame towel row": ["shoulder", "elbow"],
  "Leg extension": ["knee"], "Dumbbell step-up": ["knee", "ankle"], "Wall sit": ["knee"],
  "Standing calf raise": ["ankle"], "Dumbbell calf raise": ["ankle"], "Single-leg calf raise": ["ankle"],
  "Cable lateral raise": ["shoulder"], "Dumbbell lateral raise": ["shoulder"], "Water-bottle lateral raise": ["shoulder"],
  "Dumbbell rear-delt fly": ["lowback"],
  "Cable fly": ["shoulder"], "Dumbbell fly": ["shoulder"], "Wide push-up": ["shoulder", "wrist"],
  "EZ-bar curl": ["elbow", "wrist"], "Dumbbell hammer curl": ["elbow"], "Chin-up hold": ["shoulder", "elbow"],
  "Cable pushdown": ["elbow"], "Overhead dumbbell extension": ["elbow", "shoulder"], "Bench dip": ["shoulder", "wrist", "elbow"],
  "Cable crunch": ["neck"], "Plank": ["shoulder"],
  "Dumbbell bent-over row": ["lowback"], "Superman pull": ["lowback"],
  "Machine chest press": ["shoulder"], "Dumbbell squeeze press": ["shoulder", "elbow"], "Decline push-up": ["shoulder", "wrist"],
  "Cable front raise": ["shoulder"], "Dumbbell front raise": ["shoulder"],
  "Dumbbell shrug": ["neck"], "Backpack shrug": ["neck"],
  "Incline dumbbell curl": ["shoulder", "elbow"], "Dumbbell biceps curl": ["elbow"], "Towel biceps curl": ["elbow"],
  "EZ-bar skull crusher": ["elbow"], "Dumbbell skull crusher": ["elbow"], "Close-grip push-up": ["wrist", "elbow", "shoulder"],
  "Hack squat": ["knee"], "Dumbbell reverse lunge": ["knee", "hip"], "Reverse lunge": ["knee", "hip"],
  "Seated calf raise": ["ankle"], "Seated dumbbell calf raise": ["ankle"], "Bent-knee calf raise": ["ankle"],
  "Hanging knee raise": ["shoulder", "lowback"], "Reverse crunch": ["lowback"], "Side plank": ["shoulder"],
  "Single-leg dumbbell Romanian deadlift": ["lowback", "hip", "ankle"], "Hamstring walkout": ["knee"],
  "Hip adduction machine": ["hip"], "Dumbbell sumo squat": ["knee", "hip"], "Cossack squat": ["knee", "hip", "ankle"],
  "Back extension": ["lowback"], "Dumbbell good morning": ["lowback"], "Superman hold": ["lowback"],
  "Chest dip": ["shoulder", "elbow", "wrist"], "Dumbbell close-grip press": ["elbow"], "Archer push-up": ["shoulder", "wrist", "elbow"],
  "Cable upright row": ["shoulder", "wrist"], "Dumbbell upright row": ["shoulder"], "Wall handstand hold": ["shoulder", "wrist", "neck"],
  "Cable rope hammer curl": ["elbow"], "Dumbbell concentration curl": ["elbow"], "Backpack curl": ["elbow", "wrist"],
  "Overhead cable extension": ["elbow", "shoulder"], "Dumbbell kickback": ["elbow"], "Diamond push-up": ["wrist", "elbow", "shoulder"],
};
const PKGNAME = { workout: "Workout plan", nutrition: "Nutrition plan", both: "Workout + nutrition bundle" };
const MEALSETS = {
  3: [["Breakfast","B",.30],["Lunch","L",.40],["Dinner","D",.30]],
  4: [["Breakfast","B",.25],["Lunch","L",.35],["Snack","S",.15],["Dinner","D",.25]],
  5: [["Breakfast","B",.22],["Snack","S",.12],["Lunch","L",.30],["Snack","S",.12],["Dinner","D",.24]],
};

const r5 = g => Math.max(0, Math.round(g / 5) * 5);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Validate and normalise the intake form. Returns {intake} or {error}. */
function parseIntake(x) {
  if (!x || typeof x !== "object") return { error: "Missing form data." };
  const num = (v, lo, hi, label, optional) => {
    if (v === null || v === undefined || v === "") { if (optional) return null; throw label + " is required."; }
    const n = Number(v);
    if (!isFinite(n) || n < lo || n > hi) throw `${label} must be between ${lo} and ${hi}.`;
    return n;
  };
  const one = (v, list, label) => { if (!list.includes(v)) throw `Choose a valid ${label}.`; return v; };
  try {
    const intake = {
      region: one(x.region, ["eg", "intl"], "region"),
      pkg: one(x.pkg, ["workout", "nutrition", "both"], "package"),
      goal: one(x.goal, ["loss", "gain", "recomp", "perf"], "goal"),
      sex: one(x.sex, ["f", "m"], "sex"),
      age: num(x.age, 10, 90, "Age"),
      wt: num(x.wt, 30, 300, "Weight"),
      ht: num(x.ht, 120, 230, "Height"),
      act: one(Number(x.act), [1.2, 1.375, 1.55, 1.725], "activity level"),
      bf: num(x.bf, 3, 70, "Body fat %", true),
      bmr: num(x.bmr, 500, 5000, "Scan BMR", true),
      days: one(Number(x.days), [2, 3, 4, 5, 6], "number of training days"),
      lvl: one(x.lvl, ["beg", "int", "adv"], "level"),
      eq: one(Number(x.eq), [0, 1, 2], "equipment"),
      meals: one(Number(x.meals), [3, 4, 5], "number of meals"),
      lang: x.lang === "ar" ? "ar" : "en",
      flags: [...new Set((Array.isArray(x.flags) ? x.flags : []).filter(k => FLAGS[k]))],
      injuries: [...new Set((Array.isArray(x.injuries) ? x.injuries : []).filter(k => AREAS.en[k]))],
      medNotes: String(x.medNotes || "").replace(/\s+/g, " ").trim().slice(0, 500),
    };
    return { intake };
  } catch (e) {
    return { error: String(e) };
  }
}

function isFlagged(intake) { return intake.flags.length > 0 || intake.age < 18; }
function flagReasons(intake) { return intake.age < 18 ? ["Client is under 18"].concat(intake.flags.map(k => FLAGS[k])) : intake.flags.map(k => FLAGS[k]); }

function targets(c) {
  const lbm = c.bf ? c.wt * (1 - c.bf / 100) : null;
  let bmr, method;
  if (c.bmr && c.bmr > 500) { bmr = c.bmr; method = "InBody scan BMR"; }
  else if (lbm) { bmr = 370 + 21.6 * lbm; method = "Katch-McArdle (lean mass)"; }
  else { bmr = 10 * c.wt + 6.25 * c.ht - 5 * c.age + (c.sex === "m" ? 5 : -161); method = "Mifflin-St Jeor"; }
  const tdee = bmr * c.act;
  const adj = { loss: -0.2, gain: 0.1, recomp: -0.05, perf: 0 }[c.goal];
  let kcal = tdee * (1 + adj);
  kcal = Math.max(kcal, c.sex === "m" ? 1500 : 1200);
  const ppk = { loss: 2.2, gain: 1.8, recomp: 2.0, perf: 1.8 }[c.goal];
  const protBase = lbm ? Math.min(c.wt, lbm / 0.85) : c.wt;
  const p = Math.round(ppk * protBase);
  let f = Math.round(Math.max(0.7 * c.wt, 0.25 * kcal / 9));
  let cb = Math.round((kcal - p * 4 - f * 9) / 4);
  if (cb < 60) { f = Math.round(0.6 * c.wt); cb = Math.max(40, Math.round((kcal - p * 4 - f * 9) / 4)); }
  kcal = p * 4 + cb * 4 + f * 9;
  return { bmr: Math.round(bmr), tdee: Math.round(tdee), kcal: Math.round(kcal), p, c: cb, f, method,
    lbm: lbm ? Math.round(lbm * 10) / 10 : null, adj, ppk, protBase: Math.round(protBase) };
}

/** Foods a client can be given: matching region, not excluded. */
function eligibleFoods(allFoods, region, excluded) {
  const ex = new Set(excluded || []);
  return allFoods.filter(f => (!f.reg || f.reg === "all" || f.reg === region) && !ex.has(f.id));
}
function makeCands(foods) {
  const cands = (cat, slot) => foods.filter(f => f.cat === cat && String(f.slots).includes(slot));
  return (role, slot) => {
    if (role === "carb") return slot === "S" ? cands("fruit", "S").concat(cands("carb", "S")) : cands("carb", slot).concat(slot === "B" ? cands("fruit", "B") : []);
    return cands(role, slot);
  };
}
/** Meals that would have no protein option left. */
function proteinGaps(foods, meals) {
  const rc = makeCands(foods);
  return [...new Set(MEALSETS[meals].filter(m => !rc("protein", m[1]).length).map(m => m[0]))];
}

// Solve the gram amounts of the protein, carb and fat foods together, so the
// protein in bread or the fat in salmon counts toward the meal targets
// (weighted least squares in calorie terms, no negative or oversized portions).
function solveGrams(foods, caps, P, C, F, mins = []) {
  const W = [4, 4, 9], tgt = [P, C, F];
  const A = foods.map(f => [f.p / 100, f.c / 100, f.f / 100]); // per gram
  const fixed = new Array(foods.length).fill(null);
  for (let iter = 0; iter < 6; iter++) {
    const free = foods.map((_, j) => j).filter(j => fixed[j] === null);
    if (!free.length) break;
    const r = tgt.map((t, m) => t - foods.reduce((a, _, j) => a + (fixed[j] !== null ? A[j][m] * fixed[j] : 0), 0));
    // normal equations M x = v
    const n = free.length, M = Array.from({ length: n }, () => new Array(n).fill(0)), v = new Array(n).fill(0);
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) for (let m = 0; m < 3; m++) M[a][b] += W[m] * W[m] * A[free[a]][m] * A[free[b]][m];
      for (let m = 0; m < 3; m++) v[a] += W[m] * W[m] * A[free[a]][m] * r[m];
    }
    // light ridge term: keeps the system solvable when two foods are similar (or four foods share three targets)
    const tr = M.reduce((t, row, i) => t + row[i], 0) / n;
    for (let a = 0; a < n; a++) M[a][a] += tr * 1e-3;
    const x = gauss(M, v);
    if (!x) { free.forEach(j => (fixed[j] = 0)); break; }
    let changed = false;
    free.forEach((j, a) => {
      if (x[a] < (mins[j] || 0)) { fixed[j] = mins[j] || 0; changed = true; }
      else if (x[a] > caps[j]) { fixed[j] = caps[j]; changed = true; }
    });
    if (!changed) { free.forEach((j, a) => (fixed[j] = x[a])); break; }
  }
  return fixed.map(g => g || 0);
}
function gauss(M, v) {
  const n = v.length, a = M.map((row, i) => [...row, v[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    if (Math.abs(a[p][c]) < 1e-12) return null;
    [a[c], a[p]] = [a[p], a[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const k = a[r][c] / a[c][c]; for (let k2 = c; k2 <= n; k2++) a[r][k2] -= k * a[c][k2]; }
  }
  return a.map((row, i) => row[n] / row[i]);
}

// Foods only share a meal when their styles go together (no tuna with oats,
// no broccoli in a yogurt bowl). "any" goes with everything.
const goesWith = (a, b) => !a || !b || a === "any" || b === "any" || a === b;

function solveMeal(t, slot, pk, roleCands) {
  const items = []; let P = t.p, C = t.c, F = t.f;
  const pickFrom = (l, role) => (l.length ? l[(pk[role] || 0) % l.length] : null);
  const pf = pickFrom(roleCands("protein", slot), "protein");
  const style = pf ? pf.style : "any";
  const matching = role => { const all = roleCands(role, slot); const ok = all.filter(f => goesWith(style, f.style)); return ok.length ? ok : all; };
  if (slot !== "S" && style !== "sweet") {
    const vf = pickFrom(matching("veg"), "veg");
    if (vf) { const g = slot === "B" ? 100 : 150; items.push({ food: vf, g, role: "veg" }); P -= vf.p * g / 100; C -= vf.c * g / 100; F -= vf.f * g / 100; }
  }
  // realistic portions: a minimum so a food is worth listing, a maximum so nobody eats 7 slices of toast
  const chosen = [], roles = [], caps = [], mins = [];
  if (pf && pf.p > 0) { chosen.push(pf); roles.push("protein"); caps.push(pf.unitG ? Math.min(pf.unitG * 4, 400) : 350); mins.push(pf.unitG && pf.unitG <= 60 ? pf.unitG : 50); }
  const cf = pickFrom(matching("carb"), "carb"); if (cf && cf.c > 0) { chosen.push(cf); roles.push("carb"); caps.push(cf.cat === "fruit" ? 300 : cf.unitG ? Math.min(cf.unitG * 4, 250) : 450); mins.push(0); }
  const ff = pickFrom(matching("fat"), "fat"); if (ff && ff.f > 0) { chosen.push(ff); roles.push("fat"); caps.push(ff.f > 40 ? 60 : 200); mins.push(0); }
  let grams = solveGrams(chosen, caps, Math.max(0, P), Math.max(0, C), Math.max(0, F), mins);
  // Big targets: when the carb food hits its portion limit, add a second carb (fruit at breakfast and snacks)
  const ci = roles.indexOf("carb");
  if (ci >= 0 && grams[ci] >= caps[ci] - 1) {
    // breakfast and snacks get fruit; lunch and dinner get bread on the side (never rice plus pasta)
    const extra = (slot === "B" || slot === "S" ? roleCands("carb", slot).filter(f => f.cat === "fruit") : matching("carb").filter(f => f.unitG > 0))
      .filter(f => f.id !== cf.id && goesWith(style, f.style));
    const cf2 = pickFrom(extra, "carb");
    if (cf2) {
      chosen.splice(ci + 1, 0, cf2); roles.splice(ci + 1, 0, "carb2"); caps.splice(ci + 1, 0, cf2.cat === "fruit" ? 300 : cf2.unitG ? Math.min(cf2.unitG * 4, 250) : 450); mins.splice(ci + 1, 0, 0);
      grams = solveGrams(chosen, caps, Math.max(0, P), Math.max(0, C), Math.max(0, F), mins);
    }
  }
  chosen.forEach((food, j) => { const g = r5(grams[j]); if (g > 0) items.push({ food, g, role: roles[j] }); });
  // keep the usual order: veg, protein, carb, fat
  const order = { veg: 0, protein: 1, carb: 2, carb2: 2.5, fat: 3 };
  return items.sort((a, b) => order[a.role] - order[b.role]);
}

/* ---------- recipes ---------- */
const shortName = n => String(n).replace(/\s*\(.*?\)/g, "").split(",")[0].trim();
const lc = s => s.charAt(0).toLowerCase() + s.slice(1);
function recipeFor(mealName, items, ar) {
  const by = r => items.find(i => i.role === r);
  const p = by("protein"), c = by("carb"), f = by("fat"), v = by("veg");
  const sweet = (p && p.food.style === "sweet") || (c && c.food.cat === "fruit" && !v);
  let title;
  if (ar) {
    const n = it => shortName(fName(it.food, true));
    const T = AR_TEXT;
    if (sweet) title = `${T.recipeBowl} ${n(p || c)}${c && p ? " " + T.recipeWith + " " + n(c) : ""}${f ? " " + T.recipeAnd + n(f) : ""}`;
    else title = `${n(p || c || v)}${c && p ? " " + T.recipeWith + " " + n(c) : ""}${v ? (c && p ? " " + T.recipeAnd : " " + T.recipeWith + " ") + n(v) : ""}`;
    const steps = [];
    for (const it of [v, p, c, by("carb2")].filter(Boolean)) { const t = fPrep(it.food, true); if (t) steps.push(t.replace("{g}", it.g + " جم")); }
    steps.push(sweet ? T.seasonSweet : T.seasonSavory);
    if (f && fPrep(f.food, true)) steps.push(fPrep(f.food, true).replace("{g}", f.g + " جم"));
    steps.push(sweet ? T.plateSweet : T.plateSavory);
    const mins = Math.max(5, ...items.map(i => i.food.mins || 0)) + (items.length > 2 ? 5 : 0);
    return { title, mins, ingredients: items.map(i => `${i.g} جم ${fName(i.food, true)}${unitText(i.food, i.g, true) ? " (" + unitText(i.food, i.g, true) + ")" : ""}`), steps };
  }
  if (sweet) title = `${shortName((p || c).food.name)} bowl${c && p ? " with " + lc(shortName(c.food.name)) : ""}${f ? " & " + lc(shortName(f.food.name)) : ""}`;
  else title = `${shortName((p || c || v).food.name)}${c && p ? " with " + lc(shortName(c.food.name)) : ""}${v ? (c && p ? " & " : " with ") + lc(shortName(v.food.name)) : ""}`;
  const steps = [];
  for (const it of [v, p, c, by("carb2")].filter(Boolean)) if (it.food.prep) steps.push(it.food.prep.replace("{g}", it.g + " g"));
  steps.push(sweet
    ? "Add a pinch of cinnamon or a few drops of vanilla if you like; they add flavor without calories."
    : "Season with garlic, black pepper, cumin, lemon and fresh herbs as you like. Spices and lemon add almost no calories; go easy on salt.");
  if (f && f.food.prep) steps.push(f.food.prep.replace("{g}", f.g + " g"));
  steps.push(sweet ? "Put everything in one bowl and eat." : "Plate everything together and eat while warm.");
  const mins = Math.max(5, ...items.map(i => i.food.mins || 0)) + (items.length > 2 ? 5 : 0);
  return { title, mins, ingredients: items.map(i => `${i.g} g ${lc(i.food.name)}${unitText(i.food, i.g) ? " (" + unitText(i.food, i.g) + ")" : ""}`), steps };
}

/* ---------- videos ---------- */
function videoEmbed(url) {
  if (!url || typeof url !== "string") return null;
  let m;
  if ((m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,20})/))) return { kind: "iframe", src: "https://www.youtube-nocookie.com/embed/" + m[1] + "?rel=0" };
  if ((m = url.match(/vimeo\.com\/(?:video\/)?(\d{5,12})/))) return { kind: "iframe", src: "https://player.vimeo.com/video/" + m[1] };
  if (/^https:\/\/[^\s"'<>]+\.(mp4|webm)(\?[^\s"'<>]*)?$/i.test(url)) return { kind: "video", src: url };
  return null;
}
function allExercises() { return [...new Set(Object.values(EX).flat())]; }

const sum = items => items.reduce((a, i) => ({ k: a.k + i.food.kcal * i.g / 100, p: a.p + i.food.p * i.g / 100, c: a.c + i.food.c * i.g / 100, f: a.f + i.food.f * i.g / 100 }), { k: 0, p: 0, c: 0, f: 0 });
function unitText(f, g, ar) {
  if (!f.unitG) return "";
  const n = Math.round(g / f.unitG * 2) / 2;
  if (ar) return n > 0 ? `≈ ${n} ${AR_UNITS[f.unit] || f.unit}` : "";
  return n > 0 ? `≈ ${n} ${f.unit}${n > 1 && !/^(tbsp|tsp|g|ml)$|s$/.test(f.unit) ? "s" : ""}` : "";
}

const EX = {
  squat:["Barbell back squat","Goblet squat","Tempo bodyweight squat (3 s down)"],
  hinge:["Romanian deadlift","Dumbbell Romanian deadlift","Single-leg glute bridge"],
  lunge:["Leg press","Dumbbell walking lunge","Bulgarian split squat"],
  hpush:["Barbell bench press","Dumbbell floor press","Push-up"],
  incline:["Incline dumbbell press","Incline dumbbell press (on a step)","Feet-elevated push-up"],
  vpush:["Seated dumbbell shoulder press","Standing dumbbell press","Pike push-up"],
  hpull:["Seated cable row","One-arm dumbbell row","Inverted row under a table"],
  vpull:["Lat pulldown","Dumbbell pullover","Pull-up or door-frame towel row"],
  quad:["Leg extension","Dumbbell step-up","Wall sit"],
  ham:["Lying leg curl","Dumbbell hamstring curl","Sliding towel leg curl"],
  calf:["Standing calf raise","Dumbbell calf raise","Single-leg calf raise"],
  lat:["Cable lateral raise","Dumbbell lateral raise","Water-bottle lateral raise"],
  rear:["Face pull","Dumbbell rear-delt fly","Prone Y-raise"],
  fly:["Cable fly","Dumbbell fly","Wide push-up"],
  bi:["EZ-bar curl","Dumbbell hammer curl","Chin-up hold"],
  tri:["Cable pushdown","Overhead dumbbell extension","Bench dip"],
  core:["Cable crunch","Dumbbell dead bug","Plank"],
  // second versions, so B days and the pro split don't repeat the same exercises
  row2:["Chest-supported dumbbell row","Dumbbell bent-over row","Superman pull"],
  chest2:["Machine chest press","Dumbbell squeeze press","Decline push-up"],
  front:["Cable front raise","Dumbbell front raise","Prone T-raise"],
  shrug:["Dumbbell shrug","Dumbbell shrug","Backpack shrug"],
  bi2:["Incline dumbbell curl","Dumbbell biceps curl","Towel biceps curl"],
  tri2:["EZ-bar skull crusher","Dumbbell skull crusher","Close-grip push-up"],
  split2:["Hack squat","Dumbbell reverse lunge","Reverse lunge"],
  calf2:["Seated calf raise","Seated dumbbell calf raise","Bent-knee calf raise"],
  core2:["Hanging knee raise","Reverse crunch","Side plank"],
  // extra exercises for longer sessions
  glute:["Barbell hip thrust","Dumbbell hip thrust","Glute bridge"],
  ham2:["Seated leg curl","Single-leg dumbbell Romanian deadlift","Hamstring walkout"],
  adduct:["Hip adduction machine","Dumbbell sumo squat","Cossack squat"],
  backext:["Back extension","Dumbbell good morning","Superman hold"],
  dip:["Chest dip","Dumbbell close-grip press","Archer push-up"],
  uprow:["Cable upright row","Dumbbell upright row","Wall handstand hold"],
  bi3:["Cable rope hammer curl","Dumbbell concentration curl","Backpack curl"],
  tri3:["Overhead cable extension","Dumbbell kickback","Diamond push-up"]
};
const COMPOUND = new Set(["squat","hinge","lunge","hpush","incline","vpush","hpull","vpull","row2","chest2","split2","glute","dip","adduct"]);
const DAYT = {
  "Full body A":["squat","hpush","hpull","hinge","lat","core"],
  "Full body B":["lunge","vpush","vpull","ham","bi","tri"],
  "Upper":["hpush","hpull","vpush","vpull","lat","rear","bi","tri"],
  "Lower":["squat","hinge","lunge","glute","ham","calf","core"],
  "Upper A":["hpush","hpull","vpush","fly","lat","bi","tri","core"],
  "Lower A":["squat","ham","quad","glute","backext","calf","core"],
  "Upper B":["incline","vpull","row2","front","rear","bi2","tri2","core2"],
  "Lower B":["hinge","lunge","split2","ham2","adduct","calf2","core2"],
  "Push":["hpush","incline","vpush","fly","lat","tri","tri2"],
  "Pull":["hpull","vpull","row2","rear","bi","bi2","core"],
  "Legs":["squat","hinge","lunge","quad","ham","glute","calf"],
  "Chest":["hpush","incline","chest2","dip","fly","core"],
  "Back":["vpull","hpull","row2","backext","shrug","core2"],
  "Shoulders":["vpush","lat","front","rear","uprow","core"],
  "Arms":["bi","tri","bi2","tri2","bi3","tri3","core2"]
};
// One full week per split, so there's nothing to rotate.
const SPLIT = {
  2:["Upper","Lower"],
  3:["Push","Pull","Legs"],
  4:["Upper A","Lower A","Upper B","Lower B"],
  5:["Chest","Back","Shoulders","Legs","Arms"],
  6:["Push","Pull","Legs","Push","Pull","Legs"]
};
const SPLITNAME = {
  en: { 2: "Upper / lower", 3: "Push / pull / legs", 4: "Upper / lower, with a different A and B version of each day", 5: "Pro split: chest, back, shoulders, legs, arms", 6: "Push / pull / legs, twice a week" },
  ar: { 2: "علوي / سفلي", 3: "دفع / سحب / أرجل", 4: "علوي / سفلي، بنسختين مختلفتين (أ و ب) لكل يوم", 5: "تقسيمة المحترفين: صدر، ظهر، أكتاف، أرجل، ذراعين", 6: "دفع / سحب / أرجل، مرتين في الأسبوع" }
};
const SETS = 4; // every exercise is 4 sets
function rx(goal, role, lvl, eq, pat) {
  const T = {perf:{main:[5,"3–5","3 min"],comp:[3,"6–8","2 min"],iso:[3,"10–12","60 s"]},
             gain:{main:[4,"6–8","2–3 min"],comp:[3,"8–12","90 s"],iso:[3,"12–15","60 s"]},
             loss:{main:[3,"6–8","2 min"],comp:[3,"10–12","75 s"],iso:[2,"12–15","45 s"]},
             recomp:{main:[4,"5–8","2–3 min"],comp:[3,"8–10","90 s"],iso:[3,"10–15","60 s"]}}[goal][role];
  let [, r, rest] = T;
  const s = SETS;
  if (eq === 2 && pat !== "core") r = role === "iso" ? "15–25" : "10–20";
  if (pat === "core") r = eq === 2 || lvl === "beg" ? "30–45 s" : "10–15";
  return { txt: `${s} × ${r}`, rest };
}
// Equipment each client can use: a gym also has dumbbells and floor space, home dumbbells also allow bodyweight.
const CAN_USE = { 0: [0, 1, 2], 1: [1, 2], 2: [2] };
const LOWER_DAYS = new Set(["Lower", "Lower A", "Lower B", "Legs"]);
const FILL = {
  upper: ["hpull", "row2", "rear", "front", "bi2", "bi3", "bi", "tri3", "tri2", "core", "core2", "glute"],
  lower: ["glute", "ham", "ham2", "hinge", "adduct", "calf2", "calf", "backext", "core", "core2"],
};
const safeFor = inj => ex => !(STRESS[ex] || []).some(a => inj.has(a));
function training(c) {
  const inj = new Set(c.injuries || []), safe = safeFor(inj);
  return SPLIT[c.days].map((name, i) => {
    const used = new Set(), pats = new Set(), rows = [], swapped = [], removed = [];
    for (const pat of DAYT[name]) {
      const pref = EX[pat][c.eq];
      // the client's own equipment first, then the other versions they can do
      const ex = [c.eq, ...CAN_USE[c.eq].filter(k => k !== c.eq)].map(k => EX[pat][k]).find(x => safe(x) && !used.has(x));
      if (!ex) { if (!safe(pref)) removed.push(pref); continue; }
      if (ex !== pref) swapped.push([pref, ex]);
      used.add(ex); pats.add(pat);
      const role = rows.length === 0 ? "main" : COMPOUND.has(pat) ? "comp" : "iso";
      rows.push({ ex, ...rx(c.goal, role, c.lvl, CAN_USE[c.eq].find(k => EX[pat][k] === ex), pat) });
    }
    // top the day back up with exercises that are safe for the injury
    let need = DAYT[name].length - rows.length;
    for (const pat of FILL[LOWER_DAYS.has(name) ? "lower" : "upper"]) {
      if (need <= 0) break;
      if (pats.has(pat)) continue; // no second version of a movement already in the day
      const k = CAN_USE[c.eq].find(k => safe(EX[pat][k]) && !used.has(EX[pat][k]));
      if (k === undefined) continue;
      used.add(EX[pat][k]); pats.add(pat); need--;
      rows.push({ ex: EX[pat][k], ...rx(c.goal, rows.length === 0 ? "main" : COMPOUND.has(pat) ? "comp" : "iso", c.lvl, k, pat) });
    }
    let fin = "";
    if (c.goal === "loss") fin = "Finisher: 10 min intervals, 30 s hard / 60 s easy (bike, rower or brisk incline walk).";
    if (c.goal === "perf" && i % 2 === 0 && !["knee", "ankle", "hip"].some(a => inj.has(a))) fin = "Primer before lifting: 3 × 3 broad jumps or box jumps, full rest.";
    return { n: i + 1, name, rows, fin, swapped, removed };
  });
}

function defaultPicks(meals) { return MEALSETS[meals].map((m, i) => ({ protein: i, carb: i, fat: i, veg: i })); }

/** Full plan as plain data, ready for the plan page.
 *  opts.recipes adds a recipe per meal; opts.videos (exercise -> url) adds cues and a player per exercise. */
function buildPlan(intake, foods, picks, opts = {}) {
  const ar = (opts.lang || intake.lang) === "ar";
  const out = { pkg: intake.pkg, lang: ar ? "ar" : "en" };
  if (intake.pkg !== "workout") {
    const t = targets(intake);
    const rc = makeCands(foods);
    const day = { k: 0, p: 0, c: 0, f: 0 };
    const meals = MEALSETS[intake.meals].map((m, i) => {
      const items = solveMeal({ p: t.p * m[2], c: t.c * m[2], f: t.f * m[2] }, m[1], picks[i] || {}, rc);
      const s = sum(items);
      day.k += s.k; day.p += s.p; day.c += s.c; day.f += s.f;
      const options = {};
      for (const role of ["protein", "carb", "fat", "veg"]) options[role] = rc(role, m[1]).length;
      return { name: ar ? AR_MEALS[m[0]] || m[0] : m[0], key: m[0], kcal: Math.round(s.k), p: Math.round(s.p), c: Math.round(s.c), f: Math.round(s.f),
        items: items.map(it => ({ id: it.food.id, name: fName(it.food, ar), cat: it.food.cat, g: it.g, role: it.role, unit: unitText(it.food, it.g, ar), swappable: options[it.role] > 1 })),
        ...(opts.recipes && items.length ? { recipe: recipeFor(m[0], items, ar) } : {}) };
    });
    out.targets = t;
    out.meals = meals;
    out.day = { k: Math.round(day.k), p: Math.round(day.p), c: Math.round(day.c), f: Math.round(day.f) };
  }
  if (intake.pkg !== "nutrition") {
    out.training = training(intake);
    // what changed for the client's injuries, once per exercise, in the program language
    const nm = x => (ar ? (AR_EX[x] || [x])[0] : x);
    const sw = new Map(), rm = new Set();
    out.training.forEach(d => { d.swapped.forEach(([a, b]) => sw.set(a, b)); d.removed.forEach(x => rm.add(x)); delete d.swapped; delete d.removed; });
    const adjust = (intake.injuries || []).length ? { areas: intake.injuries.map(k => AREAS[ar ? "ar" : "en"][k]), swapped: [...sw].map(([a, b]) => [nm(a), nm(b)]), removed: [...rm].map(nm) } : null;
    out.training.forEach(d => d.rows.forEach(r => {
      r.key = r.ex; // English name: used for videos and the training log
      if (opts.videos) { r.cues = ar ? (AR_EX[r.ex] || []).slice(1) : EX_CUES[r.ex] || []; r.video = videoEmbed(opts.videos[r.ex]); }
    }));
    if (ar) out.training.forEach(d => {
      d.name = AR_DAYS[d.name] || d.name;
      d.fin = d.fin ? (d.fin.startsWith("Finisher") ? AR_TEXT.finisherLoss : AR_TEXT.primerPerf) : "";
      d.rows.forEach(r => { r.ex = (AR_EX[r.key] || [r.key])[0]; r.txt = r.txt.replace(/ s$/, " ث"); r.rest = r.rest.replace("min", "د").replace(/ s$/, " ث"); });
    });
    out.trainingInfo = { days: intake.days, split: SPLITNAME[ar ? "ar" : "en"][intake.days], adjust, eq: (ar ? ["جيم كامل", "دمبلز في البيت", "وزن الجسم فقط"] : ["full gym", "dumbbells at home", "bodyweight only"])[intake.eq] };
  }
  return out;
}

const API = { SPLIT, SPLITNAME, AREAS, STRESS, EX_VIDEOS, fName, AR_EX, STARTER_FOODS, CATS, STYLES, EX_CUES, allExercises, videoEmbed, training, FLAGS, PKGNAME, MEALSETS, parseIntake, isFlagged, flagReasons, targets, eligibleFoods, proteinGaps, buildPlan, defaultPicks };
if (NODE) module.exports = API; else window.E = API;
