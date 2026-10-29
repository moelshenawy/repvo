(function () {
  const token = location.pathname.split("/").pop();
  const money = n => "$" + Number(n).toFixed(2).replace(/\.00$/, "");
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  fetch("/api/order/" + encodeURIComponent(token)).then(r => r.json()).then(o => {
    document.getElementById("sum").innerHTML = `<div class="cart">${(o.lines || []).map(l => `<div class="line"><span>${esc(l.label)}</span><span class="p">${money(l.usd)}</span></div>`).join("")}<div class="tot"><span>Total</span><span class="big">${money(o.total)}</span></div></div>`;
  });
  const go = result => fetch("/api/mock/" + encodeURIComponent(token), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ result }) })
    .then(r => r.json()).then(j => { location.href = j.next; });
  document.getElementById("ok").onclick = e => { e.target.disabled = true; go("pay"); };
  document.getElementById("no").onclick = () => go("cancel");
})();
