// Payment gateways: mock (testing), Paymob (Egypt, cards + wallets) and Stripe.
const crypto = require("node:crypto");
const config = require("./config");

const timingEq = (a, b) => {
  const A = Buffer.from(String(a)), B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
};

/* ---------------- Paymob ---------------- */
// Docs: Create Intention API + Unified Checkout redirect + HMAC transaction callback.
const PAYMOB_HMAC_KEYS = ["amount_cents","created_at","currency","error_occured","has_parent_transaction","obj.id","integration_id","is_3d_secure","is_auth","is_capture","is_refunded","is_standalone_payment","is_voided","order.id","owner","pending","source_data.pan","source_data.sub_type","source_data.type","success"];
const dig = (o, p) => p.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
const str = v => (v === null || v === undefined ? "" : typeof v === "boolean" ? String(v) : String(v));

function paymobHmacOk(values, hmac) {
  if (!config.paymob.hmacSecret || !hmac) return false;
  const s = PAYMOB_HMAC_KEYS.map(k => str(values(k))).join("");
  const mine = crypto.createHmac("sha512", config.paymob.hmacSecret).update(s).digest("hex");
  return timingEq(mine, String(hmac).toLowerCase());
}

const paymob = {
  name: "paymob",
  ready() {
    const p = config.paymob;
    const missing = [];
    if (!p.secretKey) missing.push("PAYMOB_SECRET_KEY");
    if (!p.publicKey) missing.push("PAYMOB_PUBLIC_KEY");
    if (!p.hmacSecret) missing.push("PAYMOB_HMAC_SECRET");
    if (!p.integrationIds.length) missing.push("PAYMOB_INTEGRATION_IDS");
    return missing;
  },
  async create(order) {
    const [first, ...rest] = (order.name || "Client").trim().split(/\s+/);
    const body = {
      amount: order.charge_amount,
      currency: order.charge_currency,
      payment_methods: config.paymob.integrationIds,
      items: [{ name: order.kind === "renewal" ? "Coach follow-up (monthly)" : "Repvo order " + order.id, amount: order.charge_amount, description: order.id, quantity: 1 }],
      billing_data: {
        first_name: first || "Client", last_name: rest.join(" ") || "-", email: order.email, phone_number: order.phone,
        apartment: "NA", floor: "NA", street: "NA", building: "NA", city: "NA", state: "NA", country: order.region === "eg" ? "EG" : "NA", postal_code: "NA", shipping_method: "NA",
      },
      special_reference: order.id + "-" + Date.now().toString(36), // must be unique per attempt
      notification_url: config.baseUrl + "/webhooks/paymob",
      redirection_url: config.baseUrl + "/return/paymob",
      extras: { order_id: order.id },
    };
    const r = await fetch(config.paymob.apiUrl + "/v1/intention/", {
      method: "POST",
      headers: { Authorization: "Token " + config.paymob.secretKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`Paymob ${r.status}: ${text.slice(0, 300)}`);
    const j = JSON.parse(text);
    const url = `${config.paymob.checkoutUrl}?publicKey=${encodeURIComponent(config.paymob.publicKey)}&clientSecret=${encodeURIComponent(j.client_secret)}`;
    return { url, ref: String(j.intention_order_id || j.id || "") };
  },
  /** POST notification. Returns {orderId, paid, ref} or null if not trusted. */
  parseWebhook(query, body) {
    if (!body || body.type !== "TRANSACTION" || !body.obj) return null;
    const obj = body.obj;
    if (!paymobHmacOk(k => (k === "obj.id" ? obj.id : dig(obj, k)), query.hmac)) return { bad: true };
    const special = dig(obj, "order.merchant_order_id") || "";
    return { orderId: String(special).replace(/-[a-z0-9]+$/, ""), paid: obj.success === true && obj.pending === false, ref: String(obj.id) };
  },
  /** GET redirect back from checkout (query string). */
  parseReturn(q) {
    const map = { "obj.id": q.id, "order.id": q.order ?? q.order_id };
    if (!paymobHmacOk(k => (k in map ? map[k] : q[k]), q.hmac)) return { bad: true };
    return { orderId: String(q.merchant_order_id || "").replace(/-[a-z0-9]+$/, ""), paid: q.success === "true" && q.pending === "false", ref: String(q.id) };
  },
};

/* ---------------- Stripe ---------------- */
function form(obj, prefix = "", out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") form(v, key, out);
    else out.push(encodeURIComponent(key) + "=" + encodeURIComponent(v));
  }
  return out.join("&");
}
async function stripeApi(method, path, params) {
  const r = await fetch("https://api.stripe.com/v1" + path, {
    method,
    headers: { Authorization: "Bearer " + config.stripe.secretKey, "Content-Type": "application/x-www-form-urlencoded" },
    body: params ? form(params) : undefined,
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Stripe ${r.status}: ${j.error?.message || JSON.stringify(j).slice(0, 200)}`);
  return j;
}
const stripe = {
  name: "stripe",
  ready() {
    const m = [];
    if (!config.stripe.secretKey) m.push("STRIPE_SECRET_KEY");
    if (!config.stripe.webhookSecret) m.push("STRIPE_WEBHOOK_SECRET");
    return m;
  },
  async create(order, lines) {
    const items = {};
    lines.forEach((l, i) => {
      items[i] = { quantity: 1, price_data: { currency: "usd", unit_amount: Math.round(l.usd * 100), product_data: { name: l.label }, ...(l.recurring ? { recurring: { interval: "month" } } : {}) } };
    });
    const recurring = lines.some(l => l.recurring);
    const s = await stripeApi("POST", "/checkout/sessions", {
      mode: recurring ? "subscription" : "payment",
      line_items: items,
      customer_email: order.email,
      client_reference_id: order.id,
      metadata: { order_id: order.id },
      ...(recurring ? { subscription_data: { metadata: { order_id: order.id } } } : { payment_intent_data: { metadata: { order_id: order.id } } }),
      success_url: `${config.baseUrl}/plan/${order.token}`,
      cancel_url: `${config.baseUrl}/plan/${order.token}?cancelled=1`,
    });
    return { url: s.url, ref: s.id };
  },
  verify(rawBody, sigHeader) {
    if (!config.stripe.webhookSecret || !sigHeader) return null;
    const parts = Object.fromEntries(sigHeader.split(",").map(p => p.split("=")).filter(p => p.length === 2).map(([k, v]) => [k, v]));
    const sigs = sigHeader.split(",").filter(p => p.startsWith("v1=")).map(p => p.slice(3));
    const t = parts.t;
    if (!t || Math.abs(Date.now() / 1000 - Number(t)) > 300) return null;
    const mine = crypto.createHmac("sha256", config.stripe.webhookSecret).update(`${t}.${rawBody}`).digest("hex");
    if (!sigs.some(s => timingEq(s, mine))) return null;
    return JSON.parse(rawBody);
  },
  cancelSubscription: id => stripeApi("DELETE", "/subscriptions/" + encodeURIComponent(id)),
};

/* ---------------- Mock (testing only) ---------------- */
const mock = {
  name: "mock",
  ready: () => [],
  async create(order) { return { url: `${config.baseUrl}/pay/mock/${order.token}`, ref: "mock_" + order.id }; },
};

const providers = { paymob, stripe, mock };
function active() {
  const p = providers[config.paymentProvider];
  if (!p) throw new Error("Unknown PAYMENT_PROVIDER " + config.paymentProvider);
  return p;
}

module.exports = { providers, active, paymob, stripe, mock };
