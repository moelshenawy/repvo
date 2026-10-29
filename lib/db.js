// SQLite storage using Node's built-in driver (no install needed).
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const config = require("./config");
const { STARTER_FOODS, EX_VIDEOS } = require("./engine");

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
const db = new DatabaseSync(config.dbPath);
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");

db.exec(`
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS foods (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, cat TEXT NOT NULL,
  kcal REAL NOT NULL DEFAULT 0, p REAL NOT NULL DEFAULT 0, c REAL NOT NULL DEFAULT 0, f REAL NOT NULL DEFAULT 0,
  slots TEXT NOT NULL DEFAULT '', unit TEXT NOT NULL DEFAULT '', unit_g REAL NOT NULL DEFAULT 0,
  reg TEXT NOT NULL DEFAULT 'all', sort INTEGER NOT NULL DEFAULT 0,
  style TEXT NOT NULL DEFAULT 'any', mins INTEGER NOT NULL DEFAULT 0, prep TEXT NOT NULL DEFAULT '',
  name_ar TEXT NOT NULL DEFAULT '', prep_ar TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  token TEXT UNIQUE NOT NULL,
  kind TEXT NOT NULL DEFAULT 'plan',         -- plan | renewal
  sub_id TEXT,                               -- for renewal payments
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',    -- pending | paid | failed | expired
  provider TEXT NOT NULL,
  provider_ref TEXT,
  name TEXT, email TEXT, phone TEXT, wa TEXT,
  region TEXT, pkg TEXT, flagged INTEGER NOT NULL DEFAULT 0, flags TEXT,
  follow INTEGER NOT NULL DEFAULT 0, call_ts INTEGER,
  intake TEXT, excluded TEXT,
  lines TEXT,                                -- JSON [{label, usd}]
  total_usd REAL NOT NULL DEFAULT 0,
  charge_amount INTEGER, charge_currency TEXT, -- what the gateway actually charged (minor units)
  plan_foods TEXT, picks TEXT,
  paid_at INTEGER, client_tz TEXT
);
CREATE INDEX IF NOT EXISTS orders_created ON orders(created_at);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES orders(id),
  ts INTEGER NOT NULL,
  status TEXT NOT NULL,                      -- held | confirmed | done | cancelled
  hold_until INTEGER,
  note TEXT
);
CREATE INDEX IF NOT EXISTS bookings_ts ON bookings(ts);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL,                      -- active | past_due | cancelled
  provider TEXT NOT NULL,
  provider_sub_id TEXT,
  name TEXT, email TEXT, phone TEXT, wa TEXT,
  price_usd REAL NOT NULL,
  anchor_day INTEGER NOT NULL,
  next_charge_at INTEGER NOT NULL,
  pending_order_id TEXT
);

CREATE TABLE IF NOT EXISTS outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  to_addr TEXT NOT NULL, subject TEXT NOT NULL, html TEXT NOT NULL,
  status TEXT NOT NULL,                      -- sent | logged | failed
  error TEXT
);

CREATE TABLE IF NOT EXISTS train_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES orders(id),
  date TEXT NOT NULL,                        -- YYYY-MM-DD in the client's time zone
  day_n INTEGER NOT NULL,                    -- training day number in the plan
  data TEXT NOT NULL,                        -- JSON [{ex, sets:[{kg, reps}]}]
  note TEXT, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS train_logs_order ON train_logs(order_id, date);

CREATE TABLE IF NOT EXISTS food_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES orders(id),
  date TEXT NOT NULL,
  name TEXT NOT NULL, grams REAL,
  kcal REAL NOT NULL, p REAL NOT NULL DEFAULT 0, c REAL NOT NULL DEFAULT 0, f REAL NOT NULL DEFAULT 0,
  meal TEXT, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS food_logs_order ON food_logs(order_id, date);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, order_id TEXT, type TEXT NOT NULL, detail TEXT
);
`);

// add columns introduced after the first release
const cols = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
for (const [t, c, def] of [["foods", "style", "TEXT NOT NULL DEFAULT 'any'"], ["foods", "mins", "INTEGER NOT NULL DEFAULT 0"], ["foods", "prep", "TEXT NOT NULL DEFAULT ''"],
  ["orders", "features", "TEXT"], ["orders", "parent_id", "TEXT"], ["orders", "coaching", "TEXT"], ["orders", "lang", "TEXT"],
  ["foods", "name_ar", "TEXT NOT NULL DEFAULT ''"], ["foods", "prep_ar", "TEXT NOT NULL DEFAULT ''"],
  ["subscriptions", "tier", "TEXT NOT NULL DEFAULT 'follow'"], ["bookings", "kind", "TEXT NOT NULL DEFAULT 'call'"]]) {
  if (!cols(t).includes(c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${def}`);
}

const DEFAULTS = {
  prices: { workout: 5, nutrition: 5, both: 8, follow: 50, call: 19, train_log: 3, food_log: 3, videos: 10, recipes: 5, supplements: 5, cardio: 8 },
  availability: { tz: "Africa/Cairo", days: [6, 0, 1, 2, 3, 4], startHour: 10, endHour: 20, callMinutes: 45, horizonDays: 14, minNoticeHours: 12 },
  fx: { usdToEgp: 50 },
  team: { members: null },
  blogSeed: { slugs: null },
  videos: { offer: false, urls: { ...EX_VIDEOS } },
};

function getSetting(key) {
  const row = db.prepare("SELECT value FROM settings WHERE key=?").get(key);
  if (!row) return structuredClone(DEFAULTS[key]);
  const v = { ...DEFAULTS[key], ...JSON.parse(row.value) };
  // exercises added after the links were saved get their default video;
  // a link the coach cleared is stored as "" and stays cleared
  if (key === "videos") v.urls = { ...EX_VIDEOS, ...(v.urls || {}) };
  return v;
}
function setSetting(key, value) {
  db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, JSON.stringify(value));
}

function listFoods() {
  return db.prepare("SELECT id,name,cat,kcal,p,c,f,slots,unit,unit_g AS unitG,reg,style,mins,prep,name_ar AS nameAr,prep_ar AS prepAr FROM foods ORDER BY sort, rowid").all().map(r => ({ ...r }));
}
function replaceFoods(foods) {
  db.exec("BEGIN");
  try {
    db.exec("DELETE FROM foods");
    const ins = db.prepare("INSERT INTO foods(id,name,cat,kcal,p,c,f,slots,unit,unit_g,reg,sort,style,mins,prep,name_ar,prep_ar) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
    foods.forEach((f, i) => ins.run(f.id, f.name, f.cat, f.kcal, f.p, f.c, f.f, f.slots, f.unit || "", f.unitG || 0, f.reg || "all", i, f.style || "any", f.mins || 0, f.prep || "", f.nameAr || "", f.prepAr || ""));
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
}
if (!db.prepare("SELECT COUNT(*) n FROM foods").get().n) replaceFoods(STARTER_FOODS);

function logEvent(orderId, type, detail) {
  db.prepare("INSERT INTO events(at,order_id,type,detail) VALUES(?,?,?,?)").run(Date.now(), orderId || null, type, detail ? JSON.stringify(detail) : null);
}

function tx(fn) {
  db.exec("BEGIN IMMEDIATE");
  try { const r = fn(); db.exec("COMMIT"); return r; } catch (e) { db.exec("ROLLBACK"); throw e; }
}

module.exports = { db, getSetting, setSetting, listFoods, replaceFoods, logEvent, tx, DEFAULTS };
