const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
execFileSync(process.execPath, ['scripts/build-static.cjs'], { stdio: 'inherit' });
const context = { window: {}, document: { body: { dataset: {} } }, location: { origin: 'https://static.example' }, URL, Response };
vm.createContext(context);
vm.runInContext(fs.readFileSync('dist/assets/static-data.js', 'utf8'), context);
vm.runInContext(fs.readFileSync('dist/assets/static-demo.js', 'utf8'), context);
(async () => {
 const { request, response } = context.window.StaticDemo;
 assert.equal((await request('/api/config')).prices.both, 8);
 assert.ok((await request('/api/foods?region=eg')).length > 50);
 assert.ok((await request('/api/blog?limit=3')).length === 3);
 for (const lang of ['en', 'ar']) {
  const order = await request('/api/order/demo-' + lang);
  assert.equal(order.lang, lang);
  assert.equal(order.plan.meals.length, 4);
  assert.equal(order.plan.training.length, 4);
  assert.ok(order.plan.meals.every(m => m.items.length && m.items.every(i => !i.swappable)));
  assert.ok(fs.existsSync('dist/plan/demo-' + lang + '/index.html'));
 }
 assert.equal((await response('/api/order/unknown')).status, 404);
 for (const page of ['index.html','account/index.html','blog/index.html','plan/demo-en/index.html','plan/demo-ar/index.html','admin/index.html']) {
  const html = fs.readFileSync(path.join('dist',page),'utf8');
  for (const [,src] of html.matchAll(/(?:src|href)="(\/[^"?#]*\.(?:js|css|png|svg|webmanifest))"/g)) {
   assert.ok(fs.existsSync(path.join('dist',src)), 'Missing asset: '+src);
  }
 }
 for (const post of context.window.REPVO_DATA.posts) assert.ok(fs.existsSync('dist/blog/'+post.slug+'/index.html'));
 for (const file of ['server.js','lib/db.js','assets/admin.js','assets/mock.js']) assert.ok(!fs.existsSync(path.join('dist',file)));
 console.log('Static checks passed: sample data, EN/AR plans, missing-plan handling, assets, article routes, and no backend in output.');
})().catch(err => { console.error(err); process.exitCode=1; });
