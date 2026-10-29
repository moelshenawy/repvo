// All runtime settings come from environment variables (see .env.example).
const fs = require("node:fs");
const path = require("node:path");

// Load a .env file if present (simple KEY=VALUE lines, no dependency needed).
const envFile = path.join(__dirname, "..", ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

const env = (k, d = "") => (process.env[k] ?? d).trim();

const config = {
  port: parseInt(env("PORT", "3000"), 10),
  baseUrl: env("BASE_URL", "http://localhost:" + env("PORT", "3000")).replace(/\/$/, ""),
  dbPath: env("DB_PATH", path.join(__dirname, "..", "data", "fitplan.db")),
  appSecret: env("APP_SECRET", ""),
  adminPassword: env("ADMIN_PASSWORD", ""),
  brand: env("BRAND_NAME", "Repvo"),

  // mock | paymob | stripe
  paymentProvider: env("PAYMENT_PROVIDER", "mock").toLowerCase(),

  paymob: {
    apiUrl: env("PAYMOB_API_URL", "https://accept.paymob.com").replace(/\/$/, ""),
    checkoutUrl: env("PAYMOB_CHECKOUT_URL", "https://eg.checkout.paymob.com/").replace(/\/?$/, "/"),
    secretKey: env("PAYMOB_SECRET_KEY"),
    publicKey: env("PAYMOB_PUBLIC_KEY"),
    hmacSecret: env("PAYMOB_HMAC_SECRET"),
    // Comma-separated integration IDs (card, wallet...). Must match the currency below.
    integrationIds: env("PAYMOB_INTEGRATION_IDS").split(",").map(s => s.trim()).filter(Boolean).map(x => (/^\d+$/.test(x) ? +x : x)),
    // USD if your Paymob account has a USD integration, otherwise EGP (prices are converted with the rate set in Admin).
    currency: env("PAYMOB_CURRENCY", "EGP").toUpperCase(),
  },

  stripe: {
    secretKey: env("STRIPE_SECRET_KEY"),
    webhookSecret: env("STRIPE_WEBHOOK_SECRET"),
  },

  mail: {
    resendKey: env("RESEND_API_KEY"),
    from: env("MAIL_FROM", "Repvo <plans@example.com>"),
    coachEmail: env("COACH_EMAIL"),
  },
};

if (!config.appSecret) {
  // A stable secret is needed so admin logins survive restarts; fall back to a file-stored one.
  const p = path.join(path.dirname(config.dbPath), ".secret");
  fs.mkdirSync(path.dirname(p), { recursive: true });
  if (!fs.existsSync(p)) fs.writeFileSync(p, require("node:crypto").randomBytes(32).toString("hex"));
  config.appSecret = fs.readFileSync(p, "utf8").trim();
}

module.exports = config;
