// Light motion for the whole site: sections fade up as they scroll into view,
// numbers count up, macro bars fill, the header gets a shadow on scroll.
// Content that re-renders in place (a food swap, a saved log) doesn't replay
// the animation; only page loads, navigation and tab changes do.
// Everything is skipped when the device asks for reduced motion.
(function () {
  if (!window.matchMedia || matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
  const root = document.documentElement;
  root.classList.add("js-motion");

  const SEL = [
    ".band:not(.hero) .eyebrow", ".band:not(.hero) .h2", ".band:not(.hero) .sub2", ".steps li", ".band:not(.hero) .feat", ".pc",
    "#faq details", ".panel", ".panel.sec", ".day", ".meal", ".targets .t", ".zones .feat", ".stat", ".bars", ".prog .wk", ".lock .incl li", ".postcard", ".member", ".method .feat", ".final .inner",
  ].join(",");
  const COUNT = ".targets .v, .stat .v";

  let navAt = Date.now();
  const nav = () => { navAt = Date.now(); };
  addEventListener("hashchange", nav);
  addEventListener("popstate", nav);
  document.addEventListener("click", e => { if (e.target.closest("#ptabs button, .admtabs button, [role=tab]")) nav(); }, true);
  document.addEventListener("submit", nav, true);
  const fresh = () => Date.now() - navAt < 4000;

  function countUp(el) {
    const t = el.firstChild;
    if (!t || t.nodeType !== 3) return;
    const m = t.nodeValue.match(/^(\D*?)([\d,]+(?:\.\d+)?)(.*)$/);
    if (!m) return;
    const end = parseFloat(m[2].replace(/,/g, "")), dec = (m[2].split(".")[1] || "").length, comma = m[2].includes(",") || end >= 1000;
    if (!isFinite(end) || end === 0) return;
    const fmt = v => (comma ? v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }) : v.toFixed(dec));
    const t0 = performance.now(), dur = 900;
    const step = now => {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      t.nodeValue = m[1] + fmt(end * e) + m[3];
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  const io = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      const el = en.target;
      io.unobserve(el);
      el.classList.add("in");
      el.querySelectorAll(".fl[data-w]").forEach(f => { f.style.width = f.dataset.w; });
      if (el.matches(COUNT)) countUp(el);
      el.querySelectorAll(COUNT).forEach(countUp);
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });

  function tag(scope) {
    const list = [];
    if (scope.matches && scope.matches(SEL)) list.push(scope);
    if (scope.querySelectorAll) scope.querySelectorAll(SEL).forEach(x => list.push(x));
    list.forEach(el => {
      if (el.classList.contains("rv") || el.closest(".hero") || el.closest("[data-nomotion]") || el.closest("#out")) return;
      // stagger siblings of the same kind
      let i = 0, s = el.previousElementSibling;
      while (s && i < 6) { if (s.classList.contains("rv")) i++; s = s.previousElementSibling; }
      el.style.setProperty("--d", Math.min(i + 1, 8) * 100 + "ms");
      el.classList.add("rv");
      el.querySelectorAll(".bar .fl").forEach(f => { if (!f.dataset.w) { f.dataset.w = f.style.width; f.style.width = "0"; } });
      io.observe(el);
    });
  }

  new MutationObserver(muts => {
    if (!fresh()) return; // in-place updates (swaps, saves) render without animation
    muts.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) tag(n); }));
  }).observe(document.body || root, { childList: true, subtree: true });

  const start = () => { nav(); tag(document.body); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();

  // headline: wrap each word so the words can rise in one after another
  document.querySelectorAll(".hero h1").forEach(h => {
    if (h.dataset.split) return; h.dataset.split = "1";
    let i = 0;
    const wrap = node => [...node.childNodes].forEach(n => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.nodeValue.split(/(\s+)/).forEach(part => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
          const s = document.createElement("span"); s.className = "w"; s.style.setProperty("--i", i++); s.textContent = part; frag.appendChild(s);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1) { if (n.tagName === "EM") { n.classList.add("w"); n.style.setProperty("--i", i++); } else wrap(n); }
    });
    wrap(h);
  });

  // soft glows behind the home page photo
  document.querySelectorAll(".pagebg").forEach(bg => {
    if (bg.querySelector(".glow")) return;
    bg.insertAdjacentHTML("beforeend", '<span class="glow g1"></span><span class="glow g2"></span>');
  });

  // round back-to-top button with a progress ring; pops in once you scroll down
  const top = document.createElement("button");
  top.type = "button"; top.className = "totop"; top.setAttribute("aria-label", "Back to top");
  top.innerHTML = '<svg viewBox="0 0 52 52" aria-hidden="true"><circle class="track" cx="26" cy="26" r="24"/><circle class="ring" cx="26" cy="26" r="24"/></svg>'
    + '<svg class="arr" viewBox="0 0 24 24" aria-hidden="true" style="position:relative;rotate:0deg"><path d="M12 19V5M5 12l7-7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  top.onclick = () => scrollTo({ top: 0, behavior: "smooth" });
  document.body.appendChild(top);

  // the header scrolls away with the page, then slides back down as a solid bar
  let ticking = false;
  const onScroll = () => {
    if (ticking) return; ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const y = scrollY, max = document.documentElement.scrollHeight - innerHeight;
      root.style.setProperty("--sp", max > 0 ? Math.min(1, y / max).toFixed(4) : 0);
      root.style.setProperty("--py", Math.min(y * 0.06, 60).toFixed(1));
      root.classList.toggle("hdr-stuck", y > 220);
      top.classList.toggle("show", y > 400);
    });
  };
  addEventListener("scroll", onScroll, { passive: true }); addEventListener("resize", onScroll); onScroll();

  // header shadow once the page scrolls
  const hdr = () => document.querySelectorAll("header.site").forEach(h => h.classList.toggle("scrolled", scrollY > 8));
  addEventListener("scroll", hdr, { passive: true }); hdr();
})();
