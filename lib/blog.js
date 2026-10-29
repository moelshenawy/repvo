// Blog + team: a small, safe Markdown formatter and the HTML for the blog list,
// a post and the team cards. Runs on the server (real pages, good for Google)
// and in the browser (home page "From the blog", admin preview, the demo).
(function () {
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /** Markdown subset: ## and ### headings, paragraphs, - lists, 1. lists, > quotes, **bold**, *italic*, `code`, [links](https://…). Raw HTML is shown as text. */
  function inline(s) {
    return esc(s)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<i>$2</i>")
      .replace(/\[([^\]]+)\]\(((?:https?:\/\/|\/)[^)\s]+)\)/g, (m, t, u) => `<a href="${u}"${/^https?:/.test(u) ? ' target="_blank" rel="noopener"' : ""}>${t}</a>`);
  }
  function md(src) {
    const blocks = String(src || "").replace(/\r/g, "").split(/\n\s*\n/);
    return blocks.map(b => {
      const lines = b.split("\n").filter(l => l.trim());
      if (!lines.length) return "";
      const first = lines[0];
      if (/^###\s/.test(first)) return `<h3>${inline(first.replace(/^###\s+/, ""))}</h3>` + (lines.length > 1 ? `<p>${lines.slice(1).map(inline).join(" ")}</p>` : "");
      if (/^##\s/.test(first)) return `<h2 id="${esc(slugify(first.replace(/^##\s+/, "")))}">${inline(first.replace(/^##\s+/, ""))}</h2>` + (lines.length > 1 ? `<p>${lines.slice(1).map(inline).join(" ")}</p>` : "");
      if (lines.every(l => /^\s*[-*]\s+/.test(l))) return `<ul>${lines.map(l => `<li>${inline(l.replace(/^\s*[-*]\s+/, ""))}</li>`).join("")}</ul>`;
      if (lines.every(l => /^\s*\d+[.)]\s+/.test(l))) return `<ol>${lines.map(l => `<li>${inline(l.replace(/^\s*\d+[.)]\s+/, ""))}</li>`).join("")}</ol>`;
      if (lines.every(l => /^>\s?/.test(l))) return `<blockquote>${lines.map(l => inline(l.replace(/^>\s?/, ""))).join(" ")}</blockquote>`;
      return `<p>${lines.map(inline).join(" ")}</p>`;
    }).join("\n");
  }
  const slugify = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9؀-ۿ]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "post";
  const words = s => String(s || "").split(/\s+/).filter(Boolean).length;
  const readMins = s => Math.max(1, Math.round(words(s) / 200));
  const T = {
    en: { lockTag: "Clients", lockTitle: "Keep reading with a Repvo plan", lockSub: "The full articles are for Repvo clients. Get your plan and every article opens, or sign in if you already have one.", lockStart: "Get my plan", lockSign: "I'm a client: sign in", toc: "In this article", share: "Share", copy: "Copy link", keep: "Keep reading", topics: "Topics", allTopics: "All", search: "Search articles", searchBtn: "Search", results: (n, q) => `${n} article${n === 1 ? "" : "s"} for "${q}"`, clear: "Clear", noMatch: "No articles match. Try another word or topic.", featured: "Latest", read: n => `${n} min read`, by: "By", more: "Read", all: "All articles", back: "← All articles", cta: "Get a plan built from your numbers", ctaSub: "Workout and meal plan with exact grams, ready in 2 minutes.", ctaBtn: "Get my plan", none: "No articles yet.", note: "General fitness guidance, not medical advice." },
    ar: { lockTag: "للعملاء", lockTitle: "كمّل القراءة مع خطة Repvo", lockSub: "المقالات كاملة لعملاء Repvo. اعمل خطتك وكل المقالات تتفتح، أو سجّل دخول لو عندك خطة.", lockStart: "اعمل خطتي", lockSign: "أنا عميل: سجّل دخول", toc: "في المقال ده", share: "شارك", copy: "انسخ اللينك", keep: "كمّل قراءة", topics: "المواضيع", allTopics: "الكل", search: "دوّر في المقالات", searchBtn: "بحث", results: (n, q) => `${n} مقال عن "${q}"`, clear: "امسح", noMatch: "مفيش مقالات مطابقة. جرّب كلمة أو موضوع تاني.", featured: "الأحدث", read: n => `قراءة ${n} د`, by: "بقلم", more: "اقرأ", all: "كل المقالات", back: "→ كل المقالات", cta: "خطة معمولة من أرقامك", ctaSub: "تمرين وأكل بالجرام، جاهزة في دقيقتين.", ctaBtn: "اعمل خطتي", none: "مفيش مقالات لسه.", note: "إرشاد رياضي عام وليس نصيحة طبية." },
  };
  const date = (ts, lang) => { try { return new Intl.DateTimeFormat(lang === "ar" ? "ar-EG-u-nu-latn" : "en-US", { day: "numeric", month: "long", year: "numeric" }).format(new Date(ts)); } catch { return ""; } };

  // a drawn cover for each topic, so every card has art without uploading images
  const TOPIC = { training: "train", "تمرين": "train", nutrition: "food", "تغذية": "food", cardio: "cardio", "كارديو": "cardio", supplements: "supp", "مكملات": "supp", recovery: "rest", "راحة": "rest", "استشفاء": "rest" };
  const topicOf = tag => TOPIC[String(tag || "").trim().toLowerCase()] || "general";
  const TOPIC_NAME = { train: ["Training", "تمرين"], food: ["Nutrition", "تغذية"], cardio: ["Cardio", "كارديو"], supp: ["Supplements", "مكملات"], rest: ["Recovery", "راحة"], general: ["More", "عام"] };
  const ICON = {
    train: '<path d="M6 9v6M18 9v6M3 10.5v3M21 10.5v3M6 12h12" stroke-width="2.2"/>',
    food: '<path d="M12 7c-3.5-2-7 .5-7 4.5S8 20 10 20c1 0 1.3-.5 2-.5s1 .5 2 .5c2 0 5-4.5 5-8.5S15.5 5 12 7Z"/><path d="M12 7c0-2 1-3.5 3-4"/>',
    cardio: '<path d="M3 12h4l2-5 4 10 2-5h6"/>',
    supp: '<rect x="4" y="9" width="16" height="7" rx="3.5" transform="rotate(-35 12 12.5)"/><path d="M10 7.8l4 5.7"/>',
    rest: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>',
    general: '<path d="M4 18l5-6 4 3 7-9"/><path d="M15 6h5v5"/>',
  };
  const cover = tag => { const t = topicOf(tag); return `<span class="pcover t-${t}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[t]}</svg></span>`; };

  const LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
  function cardHTML(p, href, featured, locked) {
    const L = T[p.lang === "ar" ? "ar" : "en"];
    return `<a class="postcard${featured ? " featured" : ""}" href="${esc(href(p))}"${p.lang === "ar" ? ' dir="rtl" lang="ar"' : ""}>
      ${cover(p.tag)}${featured ? `<span class="pfeat">${L.featured}</span>` : ""}${locked ? `<span class="plock">${LOCK}${L.lockTag}</span>` : ""}
      <span class="ptag">${esc(p.tag || "")}</span>
      <h3>${esc(p.title)}</h3><p>${esc(p.excerpt)}</p>
      <span class="pmeta">${esc(date(p.published_at || p.created_at, p.lang))} · ${esc(L.read(p.mins || readMins(p.body)))}</span></a>`;
  }
  function listHTML(posts, opts = {}) {
    const href = opts.href || (p => "/blog/" + encodeURIComponent(p.slug));
    if (!posts.length) return `<p class="note">${T.en.none}</p>`;
    return `<div class="posts">${posts.map((p, i) => cardHTML(p, href, opts.feature && i === 0, opts.locked)).join("")}</div>`;
  }
  const norm = s => String(s || "").toLowerCase();
  /** Filters posts by topic and search words (title, summary, topic and text). */
  function filterPosts(posts, { tag, q } = {}) {
    const words = norm(q).split(/\s+/).filter(Boolean);
    return posts.filter(p => (!tag || topicOf(p.tag) === tag) && words.every(w => norm([p.title, p.excerpt, p.tag, p.body].join(" ")).includes(w)));
  }
  /** The blog index: language tabs, search, topic chips, then a featured article and the rest.
      link({lang, tag, q}) builds a filter URL; action/hidden describe the search form. */
  function indexHTML(all, opts = {}) {
    const { lang = null, tag = "", q = "" } = opts;
    const L = T.en;
    const link = opts.link || (o => "/blog" + ((s => s ? "?" + s : "")(new URLSearchParams(Object.entries(o).filter(([, v]) => v)).toString())));
    const inLang = all.filter(p => !lang || p.lang === lang);
    const tags = Object.keys(TOPIC_NAME).filter(k => inLang.some(p => topicOf(p.tag) === k));
    const name = k => TOPIC_NAME[k][lang === "ar" ? 1 : 0];
    const shown = filterPosts(inLang, { tag, q });
    const langTabs = `<nav class="langtabs" aria-label="Language">${[[null, "All"], ["en", "English"], ["ar", "العربية"]].map(([l, t]) =>
      `<a href="${esc(link({ lang: l, tag: "", q }))}"${(lang || null) === l ? ' aria-current="page"' : ""}>${t}</a>`).join("")}</nav>`;
    const chips = tags.length > 1 ? `<nav class="topics" aria-label="${L.topics}">${[["", lang === "ar" ? T.ar.allTopics : L.allTopics], ...tags.map(t => [t, name(t)])].map(([t, label]) =>
      `<a href="${esc(link({ lang, tag: t, q }))}"${tag === t ? ' aria-current="page"' : ""}${lang === "ar" ? ' lang="ar"' : ""}>${t ? cover(TOPIC_NAME[t][0]) : ""}${esc(label)}</a>`).join("")}</nav>` : "";
    const form = `<form class="blogsearch" role="search" action="${esc(opts.action || "/blog")}" method="get">
      ${lang ? `<input type="hidden" name="lang" value="${esc(lang)}">` : ""}${tag ? `<input type="hidden" name="tag" value="${esc(tag)}">` : ""}
      <label class="sr" for="bq">${L.search}</label><input id="bq" name="q" type="search" value="${esc(q)}" placeholder="${L.search}" autocomplete="off">
      <button class="btn small" type="submit">${L.searchBtn}</button></form>`;
    const status = q ? `<p class="note searchnote">${esc(L.results(shown.length, q))} · <a href="${esc(link({ lang, tag, q: "" }))}">${L.clear}</a></p>` : "";
    const list = shown.length ? listHTML(shown, { href: opts.href, feature: !tag && !q && shown.length > 2, locked: opts.locked }) : `<p class="note">${L.noMatch}</p>`;
    return `<div class="blogtools">${langTabs}${form}</div>${chips}${status}${list}`;
  }
  function tocHTML(body, L, plain) {
    const hs = String(body || "").split("\n").filter(l => /^##\s/.test(l)).map(l => l.replace(/^##\s+/, "").trim());
    if (hs.length < 3) return "";
    return `<nav class="toc" aria-label="${L.toc}"><b>${L.toc}</b><ol>${hs.map(h => plain ? `<li>${esc(h.replace(/[*`]/g, ""))}</li>` : `<li><a href="#${esc(slugify(h))}">${esc(h.replace(/[*`]/g, ""))}</a></li>`).join("")}</ol></nav>`;
  }
  function shareHTML(p, url, L) {
    if (!url) return "";
    const u = encodeURIComponent(url), t = encodeURIComponent(p.title);
    const a = (href, label, icon) => `<a class="sharebtn" href="${href}" target="_blank" rel="noopener" aria-label="${label}" title="${label}"><svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg></a>`;
    return `<div class="share"><span>${L.share}</span>
      ${a(`https://wa.me/?text=${t}%20${u}`, "WhatsApp", '<path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z"/>')}
      ${a(`https://www.facebook.com/sharer/sharer.php?u=${u}`, "Facebook", '<path fill="currentColor" d="M13.5 21v-7.5H16l.4-3h-2.9V8.6c0-.9.3-1.5 1.5-1.5h1.5V4.4a20 20 0 0 0-2.2-.1c-2.2 0-3.7 1.3-3.7 3.8v2.4H8v3h2.6V21h2.9Z"/>')}
      ${a(`https://twitter.com/intent/tweet?text=${t}&url=${u}`, "X", '<path fill="currentColor" d="M17.8 3h3l-6.6 7.5L22 21h-6.1l-4.8-6.2L5.6 21h-3l7-8L2 3h6.2l4.3 5.7L17.8 3Zm-1 16.2h1.7L7.3 4.7H5.5l11.3 14.5Z"/>')}
      ${a(`https://t.me/share/url?url=${u}&text=${t}`, "Telegram", '<path fill="currentColor" d="M21.4 4.2 18.3 19c-.2 1-.8 1.3-1.7.8l-4.6-3.4-2.2 2.1c-.3.3-.5.5-1 .5l.3-4.8 8.7-7.9c.4-.3-.1-.5-.6-.2L6.4 12.9 1.8 11.5c-1-.3-1-1 .2-1.5L20.1 3c.8-.3 1.6.2 1.3 1.2Z"/>')}
    </div>`;
  }
  /** The opening of an article for visitors: the first blocks, about a third of the words (at least two blocks). */
  function teaser(body) {
    const blocks = String(body || "").replace(/\r/g, "").split(/\n\s*\n/).filter(b => b.trim());
    const total = words(body), out = [];
    let n = 0;
    for (const b of blocks) {
      if (out.length >= 2 && n >= total * 0.3) break;
      out.push(b); n += words(b);
    }
    return { text: out.join("\n\n"), cut: out.length < blocks.length };
  }
  function lockHTML(L, opts) {
    return `<aside class="lockbox"><span class="lockicon">${LOCK}</span><div><b>${L.lockTitle}</b><p>${L.lockSub}</p>
      <div class="lockbtns"><a class="btn noapp" href="${esc(opts.startHref || "/#start")}">${L.lockStart}</a><a class="btn ghost" href="${esc(opts.signHref || "/account")}">${L.lockSign}</a></div></div></aside>`;
  }
  function postHTML(p, opts = {}) {
    const L = T[p.lang === "ar" ? "ar" : "en"];
    const t = opts.locked ? teaser(p.body) : null;
    const back = opts.backHref || "/blog", start = opts.startHref || "/#start";
    return `<article class="post"${p.lang === "ar" ? ' dir="rtl" lang="ar"' : ""}>
      <a class="postback" href="${esc(back)}">${L.back}</a>
      ${p.tag ? `<span class="ptag">${esc(p.tag)}</span>` : ""}
      <h1>${esc(p.title)}</h1>
      <p class="pmeta">${p.author ? `${L.by} ${esc(p.author)} · ` : ""}${esc(date(p.published_at || p.created_at, p.lang))} · ${esc(L.read(readMins(p.body)))}</p>
      <p class="lede">${esc(p.excerpt)}</p>
      ${shareHTML(p, opts.url, L)}
      ${tocHTML(p.body, L, !!t)}
      ${t ? `<div class="prose locked">${md(t.text)}</div>${lockHTML(L, opts)}` : `<div class="prose">${md(p.body)}</div>`}
      ${t ? "" : `<aside class="postcta noapp"><div><b>${L.cta}</b><span>${L.ctaSub}</span></div><a class="btn" href="${esc(start)}">${L.ctaBtn}</a></aside>`}
      ${shareHTML(p, opts.url, L)}
      <p class="note">${L.note}</p></article>
      ${opts.related && opts.related.length ? `<section class="moreposts"${p.lang === "ar" ? ' dir="rtl" lang="ar"' : ""}><h2 class="h2" style="font-size:28px">${L.keep}</h2>${listHTML(opts.related, { href: opts.href, locked: opts.locked })}</section>` : ""}`;
  }
  /** Up to n other articles: same topic and language first, then the newest in that language. */
  function relatedPosts(post, all, n = 3) {
    const others = all.filter(x => x.slug !== post.slug && x.lang === post.lang);
    return [...others.filter(x => x.tag === post.tag), ...others.filter(x => x.tag !== post.tag)].slice(0, n);
  }
  function teamHTML(team) {
    if (!team || !team.length) return "";
    const initials = n => String(n || "").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
    return `<div class="team">${(team || []).map(m => `<div class="member">
      <div class="avatar" aria-hidden="true">${esc(initials(m.name))}</div>
      <div><h3>${esc(m.name)}</h3><p class="role">${esc(m.role)}</p><p>${esc(m.bio)}</p>
      ${(m.creds || []).length ? `<p class="tags">${m.creds.map(c => `<span>${esc(c)}</span>`).join("")}</p>` : ""}</div></div>`).join("")}</div>`;
  }

  // No one is listed until the owner adds people in Admin → Team.
  const DEFAULT_TEAM = [];

  // Starter articles: accurate to how the app works. Edit or delete them in Admin → Blog.
  const STARTER_POSTS = [
    { slug: "sleep-and-muscle-growth", lang: "en", tag: "Recovery", author: "Repvo team",
      title: "Sleep: the part of your plan that happens in bed",
      excerpt: "Muscle is built after the workout, not during it. How much sleep you need and five habits that make it better.",
      body: `Training is the signal. Recovery is where your body answers it. Short or broken sleep makes the same workout give you less.

## What short sleep does

- You feel weaker and stop sets earlier, so each session does less.
- Hunger goes up the next day, especially for sweet and salty food.
- Fat loss gets harder: in studies, people who slept less lost more muscle and less fat on the same diet.

## How much is enough

Most adults do best with **7 to 9 hours** a night. If you train hard, aim for the upper end. A short nap of 20–30 minutes can help on a bad night, but it doesn't replace sleep.

## Five habits that help

1. **Same wake-up time every day**, weekends too. It sets your body clock.
2. **Caffeine before 2 pm.** Coffee, tea, energy drinks and pre-workout all count.
3. **Dark, cool, quiet room.** Around 18–20 °C works for most people.
4. **Screens away 30 minutes before bed.** Read, stretch or plan tomorrow's meals instead.
5. **Don't go to bed hungry or stuffed.** A small protein snack like yogurt is fine.

## When it's more than habits

Loud snoring, gasping at night or feeling exhausted after a full night's sleep can be signs of a sleep problem. See a doctor about it.` },
    { slug: "warm-up-in-5-minutes", lang: "en", tag: "Training", author: "Repvo team",
      title: "A 5-minute warm-up that makes every workout better",
      excerpt: "Skip the long jog. Five minutes and two ramp-up sets get your joints and muscles ready to lift.",
      body: `A good warm-up isn't about getting tired. It's about raising your body temperature and rehearsing the first lift of the day.

## Minutes 1–2: get warm

Two minutes of anything that raises your heart rate a little: brisk walking, cycling, rowing or jumping jacks at home. You should feel warmer, not out of breath.

## Minutes 3–5: move the joints you'll use

- **Lower-body days:** bodyweight squats, walking lunges, hip swings, glute bridges. 8–10 of each.
- **Upper-body days:** arm circles, band pull-aparts or light rows, push-ups on a bench, shoulder rotations. 8–10 of each.

## Then: ramp-up sets

Before your first exercise, do two or three lighter sets of it:

1. 50% of your working weight for 8 reps.
2. 70% for 5 reps.
3. 85% for 2–3 reps if the weight is heavy.

These don't count toward your plan's sets. They're practice, so make every rep look perfect.

## What to skip

Long static stretches before lifting can make you a little weaker for that session. Save them for after training or a separate day.` },
    { slug: "eating-out-without-ruining-your-plan", lang: "en", tag: "Nutrition", author: "Repvo team",
      title: "Eating out without ruining your plan",
      excerpt: "Shawarma, koshary or a burger with friends? How to fit restaurant meals into your week and keep your progress.",
      body: `One restaurant meal won't undo a week of good eating. The problem is when "one meal" turns into a whole weekend. Here's how to enjoy it and stay on track.

## Before you go

- Look at the menu online and decide what you'll order before you're hungry.
- Eat lighter earlier in the day, but don't skip meals completely. Keep your protein.
- If you track, log the meal first and plan the rest of the day around it.

## When you order

- **Build around protein:** grilled chicken, kofta, fish, steak or a shawarma plate instead of a sandwich with fries.
- **Watch the hidden calories:** tahini, garlic sauce, mayonnaise and oil can add 200–400 kcal. Ask for sauce on the side.
- **Choose one carb, not three:** rice *or* bread *or* fries.
- **Koshary:** a small portion is a filling carb meal. Add a protein later in the day, since it's low in protein.
- **Drinks count:** juice and soda can be as many calories as a meal. Go for water or diet drinks.

## After

Don't try to "make up for it" by starving the next day. Go straight back to your normal plan at the next meal. That's what keeps progress steady.` },
    { slug: "home-workouts-that-build-muscle", lang: "en", tag: "Training", author: "Repvo team",
      title: "Can home workouts really build muscle?",
      excerpt: "Yes, if the sets are hard enough. How Repvo's dumbbell and bodyweight plans keep you progressing without a gym.",
      body: `Muscles don't know where you train. They respond to sets taken close to failure, done regularly, that get a little harder over time.

## What matters most

- **Effort:** finish most sets 1–3 reps short of failure (that's the RIR in your plan).
- **Enough sets:** about 10 or more hard sets per muscle each week.
- **Progress:** do more reps, slower reps or harder versions as you get stronger.

## With dumbbells

Adjustable dumbbells cover almost everything: presses, rows, squats, lunges, Romanian deadlifts and curls. When they get too light, add reps first, then slow the lowering to 3 seconds.

## With bodyweight only

Make each exercise harder instead of heavier:

1. Push-ups → feet raised → slow push-ups → archer push-ups.
2. Squats → split squats → Bulgarian split squats → slow single-leg squats to a chair.
3. Rows under a sturdy table → feet further forward → one-arm rows.

## How Repvo plans it

Choose "home with dumbbells" or "bodyweight only" in the form. Your plan swaps every gym exercise for one you can do at home and keeps the same weekly sets, reps in reserve and 4-week progression.` },
    { slug: "el-akl-barra-men-gher-ma-teboz-el-diet", lang: "ar", tag: "تغذية", author: "فريق Repvo",
      title: "إزاي تاكل برا من غير ما تبوّظ خطتك",
      excerpt: "شاورما ولا كشري ولا برجر مع صحابك؟ إزاي تدخّل أكل المطاعم في أسبوعك وتفضل ماشي في طريقك.",
      body: `وجبة واحدة برا مش هتبوّظ أسبوع أكل كويس. المشكلة لما "وجبة واحدة" تبقى ويك إند كامل. ده إزاي تستمتع وتفضل على خطتك.

## قبل ما تنزل

- بص على المنيو أونلاين وقرر هتطلب إيه قبل ما تجوع.
- كُل أخف بدري في اليوم، بس ماتلغيش وجبات خالص، وحافظ على البروتين.
- لو بتسجل أكلك، سجّل الوجبة الأول وظبّط باقي اليوم عليها.

## وانت بتطلب

- **ابدأ بالبروتين:** فراخ مشوية، كفتة، سمك، ستيك، أو طبق شاورما بدل ساندوتش وبطاطس.
- **خد بالك من السعرات المستخبية:** الطحينة والتومية والمايونيز والزيت ممكن يزوّدوا 200 لـ 400 سعر. اطلب الصوص على جنب.
- **نشوي واحد بس:** رز **أو** عيش **أو** بطاطس.
- **الكشري:** طبق صغير وجبة نشويات مشبعة. البروتين فيه قليل، فكمّل بروتين في باقي اليوم.
- **المشروبات بتتحسب:** العصير والكانز ممكن يبقوا قد وجبة. اشرب مية أو دايت.

## بعدها

ماتحاولش "تعوّض" بإنك تجوّع نفسك تاني يوم. ارجع لخطتك العادية من الوجبة اللي بعدها. ده اللي بيخلّي التقدم ثابت.` },
    { slug: "el-nom-wel-adal", lang: "ar", tag: "راحة", author: "فريق Repvo",
      title: "النوم: الجزء من خطتك اللي بيحصل وانت نايم",
      excerpt: "العضل بيتبني بعد التمرين مش وقته. محتاج تنام قد إيه، وخمس عادات بتحسّن نومك.",
      body: `التمرين هو الإشارة، والراحة هي اللي جسمك بيرد فيها. النوم القليل أو المتقطع بيخلّي نفس التمرين يدّيك نتيجة أقل.

## النوم القليل بيعمل إيه

- بتحس إنك أضعف وبتوقف المجموعات بدري.
- الجوع بيزيد تاني يوم، خصوصًا للحلو والمالح.
- خسارة الدهون بتبقى أصعب: في الأبحاث، اللي ناموا أقل خسروا عضل أكتر ودهون أقل على نفس الأكل.

## قد إيه كفاية

أغلب الكبار محتاجين **7 لـ 9 ساعات** في الليلة. لو بتتمرن جامد، خليك قريب من 9. قيلولة 20–30 دقيقة ممكن تساعد بعد ليلة وحشة، بس ماتعوضش النوم.

## خمس عادات بتساعد

1. **صحّى في نفس الميعاد كل يوم**، حتى الجمعة.
2. **الكافيين قبل الساعة 2 الضهر.** القهوة والشاي ومشروبات الطاقة والبري وركاوت كلهم بيتحسبوا.
3. **أوضة ضلمة وباردة وهادية.** حوالي 18–20 درجة مناسبة لمعظم الناس.
4. **الموبايل بعيد قبل النوم بنص ساعة.** اقرا أو اتمطّى أو جهّز أكل بكرة.
5. **ماتنامش جعان أو مليان.** سناك بروتين صغير زي الزبادي كويس.

## لو الموضوع أكبر من عادات

الشخير العالي أو إنك بتتخنق بالليل أو إنك صاحي تعبان بعد نوم كامل ممكن يبقوا علامة على مشكلة في النوم. اكشف عند دكتور.` },
    { slug: "how-repvo-calculates-your-calories-and-macros", lang: "en", tag: "Nutrition", author: "Repvo team",
      title: "How Repvo calculates your calories and macros",
      excerpt: "The exact formulas behind your daily targets, and why your numbers differ from your friend's.",
      body: `Every Repvo meal plan starts from four numbers: calories, protein, carbs and fat. Here is exactly how we get them.

## 1. Your energy at rest (BMR)

We use the most precise method your details allow:

- **InBody scan BMR** if you enter one, because it was measured, not estimated.
- **Katch-McArdle** if you know your body fat %: 370 + 21.6 × lean mass in kg. It works from your muscle, not just your weight.
- **Mifflin-St Jeor** otherwise: 10 × weight + 6.25 × height − 5 × age, then +5 for men or −161 for women.

## 2. Your daily burn (TDEE)

Your BMR is multiplied by your daily activity: 1.2 for a desk job, 1.375 for 5–7k steps, 1.55 for 7–10k steps and 1.725 if you're on your feet all day. Training is part of these steps-based levels, so don't pick a higher one just because you lift.

## 3. Your goal

- **Fat loss:** 20% under your burn, a steady loss most people can keep up.
- **Muscle gain:** 10% over, enough to build without piling on fat.
- **Recomp:** 5% under, to lose fat slowly while you build.
- **Performance:** at maintenance.

We never go under 1,500 kcal for men or 1,200 kcal for women.

## 4. Protein, fat and carbs

Protein is set per kg of body weight: 2.2 g for fat loss (to protect muscle in a deficit), 2.0 g for recomp and 1.8 g for gain or performance. If you entered body fat, we base it on your lean mass so heavier bodies aren't given more than they need. Fat gets at least 0.7 g per kg or a quarter of your calories, whichever is more. Carbs fill the rest and fuel your training.

> Every meal is then solved in exact grams so the day adds up to these targets. Weigh your food for the first few weeks; it's the fastest way to learn what the portions look like.` },
    { slug: "how-many-days-should-you-train", lang: "en", tag: "Training", author: "Repvo team",
      title: "How many days a week should you train?",
      excerpt: "Two, three, four, five or six days: the split that fits each week, and how to pick yours.",
      body: `The best plan is the one you can repeat every week. Pick the number of days you can keep for the next three months, not your best week.

## The splits

- **2 days: upper / lower.** One day for the whole upper body, one for legs. Each muscle is hit once a week with plenty of exercises.
- **3 days: push / pull / legs.** Chest, shoulders and triceps; back and biceps; legs. The classic split for a busy schedule.
- **4 days: upper / lower, A and B.** Two upper and two lower days, and the second of each uses different exercises. Every muscle twice a week, the sweet spot for most people.
- **5 days: pro split.** Chest, back, shoulders, legs and arms on their own days, for people who enjoy longer, focused sessions.
- **6 days: push / pull / legs twice.** For experienced lifters who recover well and have the time.

## How to choose

1. New to the gym or short on time: start with 2 or 3 days.
2. Training regularly for 6 months or more: 4 days gives the best return for the time.
3. Only pick 5 or 6 days if you sleep well and can recover; more days don't help if you miss them.

## How the weeks progress

Every exercise is 4 sets. Week 1 you stop 3 reps short of failure, week 2 add weight or reps, week 3 push the top sets, and week 4 you cut the sets in half to recover before the next phase.` },
    { slug: "why-we-weigh-food-in-grams", lang: "en", tag: "Nutrition", author: "Repvo team",
      title: "Why we weigh food in grams",
      excerpt: "\"A plate of rice\" can be 200 or 800 calories. A cheap kitchen scale fixes that in a week.",
      body: `Most people who \"eat clean\" and don't see results aren't eating badly. They're guessing portions, and guesses drift.

## What changes with a scale

- A cup of cooked rice can weigh 150 g or 250 g depending on how it's packed. That's about 130 calories of difference in one portion.
- Oils and nut butters are the biggest misses: one extra spoon of oil is around 120 calories.
- Protein targets are easy to miss when you eyeball meat.

## How to weigh

1. Put the plate on the scale and press zero (tare).
2. Weigh meat, rice and pasta **cooked**, the way your plan lists them.
3. Weigh oats and other dry foods **dry**.
4. Weigh oils and sauces too; they count.

## You won't weigh forever

After two or three weeks you'll know what 150 g of chicken or 200 g of rice looks like. Then weigh once a week to check you haven't drifted.` },
    { slug: "how-much-protein-do-you-need", lang: "en", tag: "Nutrition", author: "Repvo team",
      title: "How much protein do you really need?",
      excerpt: "Why your plan sets protein per kilo of body weight, and easy ways to hit it.",
      body: `Protein builds and protects muscle. For people who lift, research reviews usually put the useful amount at about 1.6 to 2.2 g per kg of body weight a day.

## Why your number changes with your goal

- **Fat loss:** higher, 2.2 g per kg, because a calorie deficit makes muscle easier to lose.
- **Recomp:** 2.0 g per kg.
- **Muscle gain or performance:** 1.8 g per kg is enough when you're eating more.

## Easy ways to hit it

- Build each meal around a protein: chicken, fish, eggs, Greek yogurt, lean beef, lentils or ful.
- Spread it over 3–5 meals instead of one big one.
- Keep a quick option for busy days: yogurt, canned tuna or a scoop of whey.

If you have kidney disease, check with your doctor before eating more protein.` },
    { slug: "kam-yom-tetmarran", lang: "ar", tag: "تمرين", author: "فريق Repvo",
      title: "تتمرن كام يوم في الأسبوع؟",
      excerpt: "يومين، تلاتة، أربعة، خمسة أو ستة: التقسيمة المناسبة لكل عدد أيام، وإزاي تختار.",
      body: `أحسن خطة هي اللي تقدر تكررها كل أسبوع. اختار عدد الأيام اللي تقدر تلتزم بيه التلات شهور الجايين، مش أحسن أسبوع عندك.

## التقسيمات

- **يومين: علوي / سفلي.** يوم للجزء العلوي كله ويوم للأرجل.
- **3 أيام: دفع / سحب / أرجل.** صدر وأكتاف وتراي، ظهر وباي، أرجل.
- **4 أيام: علوي / سفلي بنسختين أ و ب.** النسخة التانية فيها تمارين مختلفة. كل عضلة مرتين في الأسبوع، وده الأنسب لمعظم الناس.
- **5 أيام: تقسيمة المحترفين.** صدر، ظهر، أكتاف، أرجل، ذراعين.
- **6 أيام: دفع / سحب / أرجل مرتين.** للمتمرنين المتقدمين اللي بيستشفوا كويس.

## إزاي تختار

1. جديد في الجيم أو وقتك ضيق: ابدأ بيومين أو تلاتة.
2. بتتمرن بانتظام من 6 شهور أو أكتر: 4 أيام بتدي أحسن نتيجة للوقت.
3. اختار 5 أو 6 أيام بس لو نومك كويس وبتستشفى.

كل تمرين 4 مجموعات، وكل 4 أسابيع بتحدّث بياناتك وتبدأ مرحلة جديدة.` },
    { slug: "progressive-overload-and-reps-in-reserve", lang: "en", tag: "Training", author: "Repvo team",
      title: "Progressive overload: how to keep getting stronger",
      excerpt: "Why your plan tells you to stop a few reps short, and how the 4-week cycle builds strength without burning you out.",
      body: `Muscles grow when you ask a little more of them over time. That's progressive overload: more weight, more reps or cleaner reps than last time.

## Reps in reserve (RIR)

RIR is how many more good reps you could have done when you stopped. RIR 2 means you finished the set with two clean reps left in the tank.

- It keeps you close enough to failure to grow.
- It keeps your form clean, so you don't get hurt.
- It works on any day, whether you feel strong or tired.

## Your 4-week cycle

1. **Week 1, RIR 3:** learn the movements and find your working weights.
2. **Week 2, RIR 2:** add a little weight or one or two reps.
3. **Week 3, RIR 1:** push your top sets. This is your hardest week.
4. **Week 4:** cut the sets in half. You recover, and the strength you built shows up.

Then update your stats in a new plan and start the next phase a bit stronger.

## How to add weight

- When you hit the top of the rep range on every set, add the smallest weight step next time.
- Dumbbells jump in bigger steps, so add reps first, then weight.
- Log every set in the training tracker. You can't beat last week's numbers if you don't know them.` },
    { slug: "heart-rate-zones-for-cardio", lang: "en", tag: "Cardio", author: "Repvo team",
      title: "Heart-rate zones: cardio that helps instead of hurts",
      excerpt: "Easy, tempo and hard cardio each do a different job. Here's how to find your zones from your age.",
      body: `Most people do all their cardio at the same medium pace. Splitting it into easy and hard days gives better results and leaves more energy for lifting.

## Find your maximum heart rate

Repvo uses the Tanaka formula: **208 − 0.7 × your age**. At 30 that's 187 beats per minute. It's an estimate, but a good one for most people.

## The three zones in your plan

- **Zone 2, easy: 60–70% of max.** You can talk in full sentences. Builds your base and burns fat without draining your legs.
- **Zone 3, tempo: 70–80%.** Comfortably hard; short phrases only.
- **Hard intervals: 85–92%.** A word or two at most. Short bursts that build your fitness fast.

## No watch? Use the talk test

Full sentences means zone 2, short phrases means tempo, and only a word or two means hard. It works as well as a watch for most sessions.

## Where cardio goes in your week

Do cardio after weights or on a separate day. Never do hard cardio the day before legs. Your cardio plan places each session around your lifting days for you.` },
    { slug: "fat-loss-plateau", lang: "en", tag: "Nutrition", author: "Repvo team",
      title: "Stuck on the scale? How to break a fat-loss plateau",
      excerpt: "Most plateaus aren't real. Here's how to tell, and the four fixes that work when one is.",
      body: `The scale can sit still for a week or two while you're still losing fat. Before you change anything, check whether it's a real plateau.

## Is it really a plateau?

- Your weight moves up and down by a kilo or more from day to day, mostly from water, salt and food in your gut.
- Weigh yourself every morning, after the toilet and before eating, and look at the **weekly average**, not single days.
- Take waist measurements and photos every two weeks. They often move when the scale doesn't.

It's a real plateau only when the weekly average hasn't moved for 3 weeks or more.

## The four fixes

1. **Check your portions.** Weigh your food again for a week. Oils, sauces and \"just a taste\" add up.
2. **Update your plan.** A lighter body burns less. Every 4 weeks, enter your new weight so your targets drop with you.
3. **Move more outside the gym.** Add 2,000 steps a day before you cut more food.
4. **Protect sleep.** Short sleep makes you hungrier and less active the next day.

Don't cut calories hard to break a plateau. Small, steady changes keep the muscle you've built.` },
    { slug: "creatine-what-it-does", lang: "en", tag: "Supplements", author: "Repvo team",
      title: "Creatine: what it does and how to take it",
      excerpt: "The best-researched supplement for strength, in plain words: how much, when, and what to expect.",
      body: `Creatine helps your muscles make energy for short, hard efforts like a heavy set. Over weeks that means a few more reps, which means more progress.

## How to take it

- **3–5 g of creatine monohydrate every day**, with water or a meal.
- Any time of day works. Consistency matters more than timing.
- You don't need a loading phase. Taking it daily fills your muscles within a few weeks.
- Plain creatine monohydrate is enough; expensive versions don't do more.

## What to expect

- Many people gain 1–2 kg in the first weeks. That's water inside the muscle, not fat.
- Strength and reps usually improve a little over the following weeks.
- It works best together with good training, enough protein and sleep.

## Who should ask a doctor first

If you have kidney disease, take medication, or are pregnant, check with your doctor before taking any supplement.

Choose a third-party tested product to avoid contamination. Your supplements guide in Repvo sets the doses for your weight and goal.` },
    { slug: "training-with-an-old-injury", lang: "en", tag: "Training", author: "Repvo team",
      title: "Training with an old injury: work around it, not through it",
      excerpt: "How Repvo adjusts your plan for a bad knee, shoulder or back, and the simple rules that keep you training.",
      body: `An old injury doesn't mean you can't train. It means some exercises need swapping and every set needs honest feedback from your body.

## How your plan adjusts

When you tick an area like knee, shoulder or lower back, Repvo swaps every exercise that loads it for a safer version you can do with your equipment. A barbell bench press becomes a dumbbell floor press for a sore shoulder, and squats give way to hip thrusts and leg curls for a sore knee. If there's no safe version, the exercise is left out and replaced, so every day stays complete.

## The rules that keep you training

- **Pain scale:** mild discomfort (2–3 out of 10) that settles after the set is usually fine. Sharp, stabbing or growing pain means stop that exercise.
- **Next-day check:** if the area is worse the next morning, do less load or fewer sets next time.
- **Range first, weight second:** use a range of motion that feels good, then build weight inside it.
- **Warm up the area:** two light sets before your working sets.

## When to see a professional

Recent surgery, pain at night, numbness, swelling or a joint that gives way need a doctor or physiotherapist before you train. Repvo sends those cases to a coach call instead of an automatic plan.

This is general guidance, not medical advice.` },
    { slug: "ezay-tewzen-aklak", lang: "ar", tag: "تغذية", author: "فريق Repvo",
      title: "ليه بنوزن الأكل بالجرام؟",
      excerpt: "\"طبق رز\" ممكن يكون 200 سعر أو 800. ميزان مطبخ رخيص بيحل المشكلة في أسبوع.",
      body: `أغلب الناس اللي بتاكل \"صحي\" ومش بتشوف نتيجة مش بتاكل غلط. هي بتقدّر الكميات بالعين، والعين بتغلط.

## الميزان بيغيّر إيه؟

- كوباية رز مطبوخ ممكن تبقى 150 جم أو 250 جم حسب ما بتضغطها.
- الزيت والطحينة وزبدة الفول السوداني أكبر غلطة: معلقة زيت زيادة حوالي 120 سعر.
- البروتين سهل تنقص منه لما تقدّر اللحمة بالعين.

## إزاي توزن

1. حط الطبق على الميزان واعمل تصفير.
2. وزّن اللحمة والرز والمكرونة **مطبوخين**، زي ما خطتك كاتبة.
3. وزّن الشوفان والحاجات الناشفة **ناشفة**.
4. وزّن الزيت والصوص كمان؛ بيتحسبوا.

## مش هتوزن طول عمرك

بعد أسبوعين أو تلاتة هتعرف شكل 150 جم فراخ أو 200 جم رز. وبعدها وزّن مرة في الأسبوع بس عشان تتأكد إنك مش بتزوّد.` },
    { slug: "el-protein-mehtag-ad-eh", lang: "ar", tag: "تغذية", author: "فريق Repvo",
      title: "محتاج بروتين قد إيه؟",
      excerpt: "ليه خطتك بتحسب البروتين لكل كيلو من وزنك، وطرق سهلة توصل للرقم.",
      body: `البروتين بيبني العضل وبيحافظ عليه. للناس اللي بتلعب حديد، الأبحاث غالبًا بتقول إن الكمية المفيدة حوالي 1.6 لـ 2.2 جم لكل كيلو من وزنك في اليوم.

## الرقم بيتغير حسب هدفك

- **خسارة دهون:** أعلى، 2.2 جم لكل كيلو، لأن العجز في السعرات بيسهّل خسارة العضل.
- **إعادة تشكيل:** 2.0 جم لكل كيلو.
- **زيادة عضل أو أداء:** 1.8 جم لكل كيلو كفاية وانت بتاكل أكتر.

## طرق سهلة توصل للرقم

- خلي كل وجبة مبنية على بروتين: فراخ، سمك، بيض، زبادي يوناني، لحمة قليلة الدهن، عدس أو فول.
- وزّعه على 3 لـ 5 وجبات بدل وجبة واحدة كبيرة.
- خلي عندك حاجة سريعة للأيام المزحومة: زبادي، تونة، أو سكوب واي.

لو عندك مرض في الكلى، اسأل دكتورك قبل ما تزوّد البروتين.` },
    { slug: "manatek-el-nabd-fel-cardio", lang: "ar", tag: "كارديو", author: "فريق Repvo",
      title: "مناطق النبض: كارديو يفيدك مش يتعبك",
      excerpt: "الكارديو السهل والمتوسط والصعب كل واحد ليه دور. اعرف مناطقك من سنّك.",
      body: `أغلب الناس بتعمل كل الكارديو بنفس السرعة المتوسطة. لما تقسّمه لأيام سهلة وأيام صعبة، النتيجة بتبقى أحسن وبيفضل عندك طاقة للحديد.

## أقصى نبض ليك

Repvo بيستخدم معادلة تاناكا: **208 − 0.7 × سنّك**. لو عندك 30 سنة يبقى 187 نبضة في الدقيقة. رقم تقريبي، بس كويس لمعظم الناس.

## المناطق التلاتة في خطتك

- **المنطقة 2، سهل: 60–70% من الأقصى.** تقدر تتكلم بجمل كاملة. بيبني لياقتك الأساسية وبيحرق دهون من غير ما يتعب رجلك.
- **المنطقة 3، تيمبو: 70–80%.** صعب بس مريح؛ كلمتين تلاتة بس.
- **إنترفال صعب: 85–92%.** كلمة أو اتنين بالعافية. فترات قصيرة بتحسّن لياقتك بسرعة.

## مفيش ساعة؟ استخدم اختبار الكلام

جمل كاملة يبقى المنطقة 2، كلمتين تلاتة يبقى تيمبو، وكلمة واحدة يبقى صعب.

## الكارديو فين في أسبوعك

اعمل الكارديو بعد الحديد أو في يوم لوحده، وماتعملش كارديو صعب قبل يوم الرجل. خطة الكارديو بتحط كل حصة حوالين أيام الحديد بتاعتك.` },
  ];

  const API = { md, esc, slugify, readMins, teaser, listHTML, indexHTML, filterPosts, relatedPosts, postHTML, teamHTML, cardHTML, cover, DEFAULT_TEAM, STARTER_POSTS, T };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else window.BLOG = API;
})();
