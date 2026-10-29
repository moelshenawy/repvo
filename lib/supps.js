// Personal supplements guide. Only well-supported basics with standard doses;
// everything else goes on the "skip" list. Built from the intake, the daily
// targets and the foods the client eats. English and Arabic.

function supplementsGuide(intake, targets, foods, lang) {
  const ar = lang === "ar";
  const wt = intake.wt;
  const trains = intake.pkg !== "nutrition";
  const names = new Set((foods || []).map(f => f.name));
  const eatsFish = ["Salmon, baked", "Sardines in oil, drained"].some(n => names.has(n));
  const protPerKg = targets ? targets.p / wt : 1.6;
  const caffeine = Math.min(300, Math.round(3 * wt / 10) * 10);
  const items = [];

  items.push(ar
    ? { name: "كرياتين مونوهيدرات", dose: "3–5 جم يوميًا", when: "أي وقت في اليوم، مع ماء أو وجبة. مفيش داعي لفترة تحميل.", why: "أكثر مكمّل مثبت علميًا لزيادة القوة والأداء والحفاظ على العضلات. اشرب مياه كفاية." }
    : { name: "Creatine monohydrate", dose: "3–5 g every day", when: "Any time of day, with water or a meal. No loading phase needed.", why: "The best-researched supplement for strength, performance and keeping muscle. Drink enough water." });

  items.push(ar
    ? { name: "واي بروتين (اختياري)", dose: "سكوب (25–30 جم بروتين) عند الحاجة", when: "بعد التمرين أو كسناك، فقط في الأيام اللي مش بتوصل فيها لهدف البروتين من الأكل.", why: `هدفك ${targets ? targets.p : "–"} جم بروتين يوميًا (${protPerKg.toFixed(1)} جم/كجم). الواي طريقة سهلة ورخيصة لتكملته؛ مش أفضل من الأكل.` }
    : { name: "Whey protein (optional)", dose: "1 scoop (25–30 g protein) when needed", when: "After training or as a snack, only on days you can't reach your protein target from food.", why: `Your target is ${targets ? targets.p : "–"} g protein a day (${protPerKg.toFixed(1)} g/kg). Whey is an easy, cheap way to top it up; it isn't better than food.` });

  items.push(ar
    ? { name: "فيتامين د3", dose: "1000–2000 وحدة دولية يوميًا", when: "مع وجبة فيها دهون.", why: "نقص فيتامين د شائع جدًا حتى في البلاد المشمسة. الأفضل تعمل تحليل وتظبط الجرعة مع دكتورك." }
    : { name: "Vitamin D3", dose: "1,000–2,000 IU a day", when: "With a meal that contains fat.", why: "Low vitamin D is very common, even in sunny countries. Best to test your level and adjust the dose with your doctor." });

  if (!eatsFish) items.push(ar
    ? { name: "أوميجا 3 (زيت سمك)", dose: "1–2 جم EPA+DHA يوميًا", when: "مع الوجبة.", why: "خطتك مفيهاش سمك دهني، وده المصدر الأساسي للأوميجا 3. لو بقيت تاكل سلمون أو سردين مرتين في الأسبوع، ممكن تستغنى عنه." }
    : { name: "Omega-3 (fish oil)", dose: "1–2 g EPA + DHA a day", when: "With a meal.", why: "Your plan has no oily fish, the main source of omega-3. If you start eating salmon or sardines twice a week, you can drop it." });

  if (trains) items.push(ar
    ? { name: "كافيين قبل التمرين (اختياري)", dose: `حتى ${caffeine} مجم (حوالي 3 مجم/كجم من وزنك)`, when: "30–60 دقيقة قبل التمرين. ممنوع في آخر 8 ساعات قبل النوم.", why: "بيحسّن الأداء والتركيز. فنجان قهوة سادة فيه حوالي 80–100 مجم. ابدأ بنص الجرعة لو مش متعود. لا تتجاوز 400 مجم في اليوم من كل المصادر." }
    : { name: "Caffeine before training (optional)", dose: `Up to ${caffeine} mg (about 3 mg per kg)`, when: "30–60 min before training. None within 8 hours of bedtime.", why: "Improves performance and focus. A cup of black coffee has about 80–100 mg. Start with half if you're not used to it. Stay under 400 mg a day from all sources." });

  if (intake.region === "eg" || trains) items.push(ar
    ? { name: "أملاح ومعادن (إلكتروليت)", dose: "حسب العرق: رشة ملح وعصير أو شراب أملاح", when: "في الأيام الحر أو التمرين الطويل اللي بتعرق فيه كتير.", why: "صيف مصر بيخلّي فقدان الأملاح كبير. ده بيمنع الصداع والتقلصات وهبوط الأداء." }
    : { name: "Electrolytes", dose: "As needed: a pinch of salt plus juice, or an electrolyte drink", when: "On hot days or long, sweaty sessions.", why: "Heat raises salt losses a lot. This prevents headaches, cramps and drops in performance." });

  if (intake.goal === "loss") items.push(ar
    ? { name: "ألياف السيليوم (اختياري)", dose: "5 جم مع كوب ماء كبير", when: "قبل الوجبة الأكبر في اليوم.", why: "بيساعد على الشبع وانتظام الهضم وقت الدايت. ابدأ بجرعة صغيرة واشرب مياه كفاية." }
    : { name: "Psyllium fibre (optional)", dose: "5 g with a large glass of water", when: "Before your largest meal.", why: "Helps with fullness and digestion while dieting. Start small and drink plenty of water." });

  const skip = ar
    ? ["حارقات الدهون وأقراص التخسيس: تأثيرها ضعيف ومخاطرها حقيقية.", "BCAA وEAA: مش محتاجهم طالما بتوصل لهدف البروتين.", "منشطات التستوستيرون: مفيش دليل إنها بتشتغل.", "شاي الديتوكس: الكبد والكلى بيعملوا ده ببلاش.", "الماس جينر: الأكل أرخص وأفضل لزيادة السعرات."]
    : ["Fat burners and slimming pills: weak effect, real risks.", "BCAAs and EAAs: not needed when you hit your protein target.", "Testosterone boosters: no good evidence they work.", "Detox teas: your liver and kidneys do this for free.", "Mass gainers: food is cheaper and better for extra calories."];
  if (intake.sex === "f") skip.push(ar
    ? "الحديد: ما تاخدهوش من نفسك. اعملي تحليل فيريتين الأول، ولو ناقص دكتورك يحدد الجرعة."
    : "Iron: don't take it on your own. Get a ferritin blood test first; if it's low, your doctor sets the dose.");

  const notes = ar
    ? ["المكملات بتكمّل الأكل والنوم والتمرين، مش بتعوّضهم.", "اختار منتجات مختبرة من جهة مستقلة (مثل Informed Sport) لتفادي الغش أو المواد الممنوعة.", "لو عندك مرض مزمن أو بتاخد أدوية، اسأل دكتورك قبل أي مكمّل.", "ده إرشاد عام وليس نصيحة طبية."]
    : ["Supplements add to good food, sleep and training; they don't replace them.", "Choose third-party tested products (for example Informed Sport) to avoid contamination or banned substances.", "If you have a medical condition or take medication, check with your doctor before any supplement.", "This is general guidance, not medical advice."];

  return { items, skip, notes };
}

if (typeof module !== "undefined" && module.exports) module.exports = { supplementsGuide }; else window.SUPPS = { supplementsGuide };
