// Installable website + phone-app glue.
// 1. Registers the service worker so the site can be installed and plans open offline.
// 2. Inside the Repvo apps (user agent contains "RepvoApp"): hides anything for sale,
//    makes the Android back button go back, and sets the status bar colour.
(function () {
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    addEventListener("load", () => { navigator.serviceWorker.register("/sw.js").catch(() => {}); });
  }
  if (!/RepvoApp/.test(navigator.userAgent)) return;
  document.documentElement.classList.add("in-app");
  const cap = window.Capacitor;
  if (!cap || !cap.Plugins) return;
  const P = cap.Plugins;
  try {
    if (P.App) P.App.addListener("backButton", e => { if (e && e.canGoBack) history.back(); else P.App.exitApp(); });
    if (P.StatusBar) { P.StatusBar.setBackgroundColor && P.StatusBar.setBackgroundColor({ color: "#1E56C8" }).catch(() => {}); P.StatusBar.setStyle && P.StatusBar.setStyle({ style: "DARK" }).catch(() => {}); }
    if (P.SplashScreen) P.SplashScreen.hide().catch(() => {});
  } catch (e) {}
})();
