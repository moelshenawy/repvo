const fs = require('node:fs');
const path = require('node:path');
const { renderBusiness } = require('../lib/business');
const { policyPage } = require('../lib/legal');
const E = require('../lib/engine');
const B = require('../lib/blog');
const { cardioPlan } = require('../lib/cardio');
const { supplementsGuide } = require('../lib/supps');
const out = path.resolve(__dirname, '../dist');
// Only this generated output directory is replaced.
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.resolve(__dirname, '../public'), out, { recursive: true });
const terms = fs.readFileSync(path.join(out, 'terms.html'), 'utf8');
for (const policy of ['refund-policy', 'privacy-policy']) {
  fs.writeFileSync(path.join(out, policy + '.html'), policyPage(terms, policy));
}
for (const file of fs.readdirSync(out).filter(file => file.endsWith('.html'))) {
  const target = path.join(out, file);
  fs.writeFileSync(target, renderBusiness(fs.readFileSync(target, 'utf8')));
}
fs.mkdirSync(path.join(out, 'js'), { recursive: true });
fs.copyFileSync(path.resolve(__dirname, '../lib/blog.js'), path.join(out, 'js/blog.js'));
for (const file of ['assets/admin.js', 'assets/mock.js', 'mock-pay.html']) fs.rmSync(path.join(out, file), { force: true });
const date = Date.UTC(2026, 9, 1, 12);
const prices = { workout: 5, nutrition: 5, both: 8, follow: 50, call: 19, train_log: 3, food_log: 3, videos: 10, recipes: 5, supplements: 5, cardio: 8 };
const orders = {};
for (const lang of ['en', 'ar']) {
  const intake = { region: lang === 'ar' ? 'eg' : 'intl', lang, pkg: 'both', goal: 'recomp', sex: 'm', age: 28, wt: 80, ht: 178, act: 1.55, bf: null, bmr: null, days: 4, lvl: 'beg', eq: 0, meals: 4, flags: [], injuries: [] };
  const foods = E.eligibleFoods(E.STARTER_FOODS, intake.region, []);
  const plan = E.buildPlan(intake, foods, E.defaultPicks(4), { recipes: true });
  plan.meals.forEach(m => m.items.forEach(item => { item.swappable = false; }));
  orders['demo-' + lang] = { id: 'SAMPLE-' + lang.toUpperCase(), kind: 'plan', status: 'paid', name: 'Alex Demo', pkg: 'both', pkgName: E.PKGNAME.both, flagged: false, flags: [], lang, features: ['recipes', 'cardio', 'supplements'], upgrades: [], calls: [], lines: [], total: 0, paidAt: date, contact: { email: 'demo@example.com', wa: '' }, plan, cardio: cardioPlan(intake, E.SPLIT[4], lang), supplements: supplementsGuide(intake, E.targets(intake), foods, lang) };
}
const data = { config: { brand: 'Repvo', prices, callMinutes: 45, coachTz: 'Africa/Cairo', coachDays: [0,1,2,3,4,6], startHour: 10, endHour: 20, chargeCurrency: 'USD', fxRate: null, provider: 'static', flags: E.FLAGS, videosOn: false }, foods: E.STARTER_FOODS, team: [
 { name: 'Alex Morgan', role: 'Training coach · Sample profile', bio: 'An example team profile for the static preview, focused on strength training and consistent habits.', creds: ['Demo profile'] },
 { name: 'Sara Hassan', role: 'Nutrition coach · Sample profile', bio: 'An example team profile showing support for practical meals and everyday food choices.', creds: ['Demo profile'] },
 { name: 'Omar Ali', role: 'Client support · Sample profile', bio: 'An example support profile for plan guidance and weekly check-ins.', creds: ['Demo profile'] }
], posts: B.STARTER_POSTS.map((p, i) => ({ ...p, id: i + 1, published_at: date - i * 86400000, mins: B.readMins(p.body) })), orders };
fs.writeFileSync(path.join(out, 'assets/static-data.js'), 'window.REPVO_DATA = ' + JSON.stringify(data).replace(/</g, '\\u003c') + ';\n');
// Real directories also make clean URLs work with a basic static file server.
const routes = { 'refund-policy': 'refund-policy.html', 'privacy-policy': 'privacy-policy.html', contact: 'contact.html', account: 'account.html', admin: 'admin.html', terms: 'terms.html', offline: 'offline.html', blog: 'blog.html', 'plan/demo-en': 'plan.html', 'plan/demo-ar': 'plan.html' };
for (const post of data.posts) routes['blog/' + post.slug] = 'blog.html';
for (const [route, source] of Object.entries(routes)) {
  const dir = path.join(out, route);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(path.join(out, source), path.join(dir, 'index.html'));
}
console.log('Static site built in dist: pages, sample plans, blog, and local data. No server or database required.');
