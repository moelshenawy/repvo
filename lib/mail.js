// Email: sends through Resend (https://resend.com) when RESEND_API_KEY is set.
// Every message is also stored in the outbox table, which the admin can read,
// so nothing is lost while email is not configured yet.
const config = require("./config");
const { db } = require("./db");

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function layout(title, body, ar) {
  return `<!doctype html><html${ar ? ' lang="ar" dir="rtl"' : ""}><body style="margin:0;background:#EDF0F2;font-family:Arial,Helvetica,sans-serif;color:#13171B">
<div style="max-width:560px;margin:0 auto;padding:24px 16px"${ar ? ' dir="rtl"' : ""}>
<div style="font-weight:800;font-size:24px;text-transform:uppercase;letter-spacing:.02em">REP<span style="color:#1E56C8">V</span>O</div>
<div style="font-size:13px;color:#5B6570;margin:2px 0 14px">${ar ? "اتمرّن صح. كُل صح." : "Lift right. Eat right."}</div>
<div style="background:#fff;border:1px solid #D5DBE0;border-radius:10px;padding:20px">
<h1 style="font-size:20px;margin:0 0 12px">${esc(title)}</h1>${body}</div>
<p style="font-size:12px;color:#5B6570;margin-top:14px">${ar ? "الخطط إرشاد رياضي عام وليست نصيحة طبية." : "Plans are general fitness guidance, not medical advice."}</p></div></body></html>`;
}
const button = (href, label) => `<p style="margin:18px 0"><a href="${esc(href)}" style="background:#1E56C8;color:#fff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:8px;display:inline-block">${esc(label)}</a></p>`;

async function send(to, subject, html) {
  if (!to) return;
  let status = "logged", error = null;
  if (config.mail.resendKey) {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: "Bearer " + config.mail.resendKey, "Content-Type": "application/json" },
        body: JSON.stringify({ from: config.mail.from, to: [to], subject, html }),
      });
      if (r.ok) status = "sent"; else { status = "failed"; error = `${r.status} ${(await r.text()).slice(0, 300)}`; }
    } catch (e) { status = "failed"; error = String(e.message || e); }
  } else {
    console.log(`[mail:not-configured] to=${to} subject="${subject}"`);
  }
  db.prepare("INSERT INTO outbox(created_at,to_addr,subject,html,status,error) VALUES(?,?,?,?,?,?)").run(Date.now(), to, subject, html, status, error);
  if (error) console.error("[mail] failed:", error);
}

module.exports = { send, layout, button, esc };
