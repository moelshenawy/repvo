// Blog posts and the team list (stored in the database, edited in Admin).
const { db, getSetting, setSetting } = require("./db");
const B = require("./blog");

db.exec(`CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL, lang TEXT NOT NULL DEFAULT 'en',
  title TEXT NOT NULL, excerpt TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '',
  tag TEXT NOT NULL DEFAULT '', author TEXT NOT NULL DEFAULT '',
  published INTEGER NOT NULL DEFAULT 0, published_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);`);
// Starter articles: each is added once. Ones the owner deletes never come back,
// and new starter articles reach sites that already have the older ones.
(function seedStarterPosts() {
  const seen = getSetting("blogSeed").slugs || db.prepare("SELECT slug FROM posts").all().map(r => r.slug);
  const have = new Set(db.prepare("SELECT slug FROM posts").all().map(r => r.slug));
  const ins = db.prepare("INSERT INTO posts(slug,lang,title,excerpt,body,tag,author,published,published_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,1,?,?,?)");
  const now = Date.now();
  B.STARTER_POSTS.forEach((p, i) => {
    if (seen.includes(p.slug) || have.has(p.slug)) return;
    const t = now - i * 6 * 3600e3; // spread out so they don't share one time
    ins.run(p.slug, p.lang, p.title, p.excerpt, p.body, p.tag, p.author, t, t, t);
  });
  setSetting("blogSeed", { slugs: [...new Set([...seen, ...B.STARTER_POSTS.map(p => p.slug)])] });
})();

const cols = "id,slug,lang,title,excerpt,tag,author,published,published_at,created_at,updated_at";
function list({ all = false, lang = null, limit = 50, withBody = false } = {}) {
  const where = [all ? "1=1" : "published=1"], args = [];
  if (lang === "en" || lang === "ar") { where.push("lang=?"); args.push(lang); }
  return db.prepare(`SELECT ${cols}, body FROM posts WHERE ${where.join(" AND ")} ORDER BY COALESCE(published_at, created_at) DESC LIMIT ?`).all(...args, Math.min(200, Math.max(1, limit | 0 || 50)))
    .map(p => { const mins = B.readMins(p.body); if (!all && !withBody) delete p.body; return { ...p, mins }; });
}
const bySlug = slug => db.prepare("SELECT * FROM posts WHERE slug=? AND published=1").get(slug);
const byId = id => db.prepare("SELECT * FROM posts WHERE id=?").get(id);

function clean(b, old) {
  const s = v => String(v ?? "").trim();
  const title = s(b.title).slice(0, 160);
  if (!title) return { error: "Give the post a title." };
  const slug = B.slugify(s(b.slug) || title);
  const clash = db.prepare("SELECT id FROM posts WHERE slug=?").get(slug);
  if (clash && (!old || clash.id !== old.id)) return { error: `Another post already uses the address /blog/${slug}. Change the slug.` };
  const published = b.published ? 1 : 0;
  return { v: { slug, lang: b.lang === "ar" ? "ar" : "en", title, excerpt: s(b.excerpt).slice(0, 300), body: String(b.body || "").slice(0, 60000),
    tag: s(b.tag).slice(0, 30), author: s(b.author).slice(0, 80), published, published_at: published ? (old && old.published_at) || Date.now() : (old && old.published_at) || null } };
}
function create(b) {
  const r = clean(b); if (r.error) return r;
  const now = Date.now(), v = r.v;
  const info = db.prepare("INSERT INTO posts(slug,lang,title,excerpt,body,tag,author,published,published_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
    .run(v.slug, v.lang, v.title, v.excerpt, v.body, v.tag, v.author, v.published, v.published_at, now, now);
  return { ok: true, post: byId(info.lastInsertRowid) };
}
function update(id, b) {
  const old = byId(id); if (!old) return { error: "Post not found." };
  const r = clean(b, old); if (r.error) return r;
  const v = r.v;
  db.prepare("UPDATE posts SET slug=?,lang=?,title=?,excerpt=?,body=?,tag=?,author=?,published=?,published_at=?,updated_at=? WHERE id=?")
    .run(v.slug, v.lang, v.title, v.excerpt, v.body, v.tag, v.author, v.published, v.published_at, Date.now(), id);
  return { ok: true, post: byId(id) };
}
const remove = id => (db.prepare("DELETE FROM posts WHERE id=?").run(id).changes ? { ok: true } : { error: "Post not found." });

function team() { const t = getSetting("team"); return Array.isArray(t.members) ? t.members : B.DEFAULT_TEAM; }
function setTeam(members) {
  if (!Array.isArray(members)) return { error: "Send a list of team members." };
  const s = v => String(v ?? "").trim();
  const m = members.slice(0, 30).map(x => ({ name: s(x.name).slice(0, 80), role: s(x.role).slice(0, 80), bio: s(x.bio).slice(0, 500),
    creds: (Array.isArray(x.creds) ? x.creds : String(x.creds || "").split(",")).map(s).filter(Boolean).slice(0, 8).map(c => c.slice(0, 60)) })).filter(x => x.name);
  setSetting("team", { members: m });
  return { ok: true, members: m };
}

module.exports = { list, bySlug, byId, create, update, remove, team, setTeam };
