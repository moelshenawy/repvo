// Light / dark switch. Loaded in <head> so a saved choice applies before the page paints.
// Without a saved choice, pages follow the device setting (the home page photo stays dark).
(function () {
  const root = document.documentElement;
  const KEY = "rv_theme";
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  if (saved === "dark" || saved === "light") root.setAttribute("data-theme", saved);

  const isDark = () => {
    const bg = getComputedStyle(root).getPropertyValue("--bg").trim() || "#fff";
    const m = bg.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (!m) return root.getAttribute("data-theme") === "dark";
    const [r, g, b] = m.slice(1).map(h => parseInt(h, 16));
    return (r * 299 + g * 587 + b * 114) / 1000 < 128;
  };
  const SUN = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const MOON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';

  function paint(btn) {
    const dark = isDark();
    btn.innerHTML = dark ? SUN : MOON;
    const label = dark ? "Switch to light mode" : "Switch to dark mode";
    btn.setAttribute("aria-label", label); btn.title = label;
    btn.setAttribute("aria-pressed", String(dark));
  }
  function add() {
    document.querySelectorAll("header.site .nav").forEach(nav => {
      if (nav.querySelector(".themebtn")) return;
      const btn = document.createElement("button");
      btn.type = "button"; btn.className = "themebtn";
      btn.onclick = () => {
        const next = isDark() ? "light" : "dark";
        root.classList.add("theme-anim");
        root.setAttribute("data-theme", next);
        try { localStorage.setItem(KEY, next); } catch (e) {}
        document.querySelectorAll(".themebtn").forEach(paint);
        setTimeout(() => root.classList.remove("theme-anim"), 450);
      };
      // sits just before "My plans" / "Get my plan", or at the end of the bar
      const before = nav.querySelector(".myplans, .navcta");
      if (before) nav.insertBefore(btn, before); else nav.appendChild(btn);
      if (!before) btn.style.marginLeft = "auto";
      paint(btn);
    });
  }
  window.RepvoTheme = { refresh: () => document.querySelectorAll(".themebtn").forEach(paint) };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", add); else add();
  // pages that switch views in place (home ⇄ form) can change the colours under the button
  addEventListener("hashchange", () => setTimeout(window.RepvoTheme.refresh, 50));
  if (window.matchMedia) matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => window.RepvoTheme.refresh());
})();
