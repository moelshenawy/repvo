const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
// Parse the exact file bytes: a UTF-8 BOM makes deployment JSON invalid.
const deploymentConfig = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
assert.equal(deploymentConfig.framework, null);
assert.equal(deploymentConfig.buildCommand, 'npm run build');
assert.equal(deploymentConfig.outputDirectory, 'dist');
execFileSync(process.execPath, ['scripts/build-static.cjs'], { stdio: 'inherit' });
const { business, renderBusiness } = require('../lib/business');
const policies = fs.readFileSync('dist/terms/index.html', 'utf8');
for (const id of ['terms', 'refund-policy', 'privacy-policy']) {
 assert.ok(policies.includes(`id="${id}"`), 'Missing public policy section: ' + id);
}
assert.ok(!/\[(?:ADDRESS|SUPPORT EMAIL|SUPPORT NUMBER|COMPANY LEGAL NAME|DATE)\]/.test(policies));
for (const file of ['index.html', 'contact/index.html', 'terms/index.html', 'refund-policy/index.html', 'privacy-policy/index.html', 'blog/index.html', 'account/index.html', 'plan/demo-ar/index.html']) {
 const html = fs.readFileSync(path.join('dist', file), 'utf8');
 const footer = html.match(/<footer[\s\S]*?<\/footer>/)[0];
 assert.ok(footer.includes(`href="mailto:${business.email}"`), 'Missing footer email: ' + file);
 assert.ok(footer.includes(`href="tel:${business.phone}"`), 'Missing footer phone: ' + file);
 for (const href of ['/contact', '/terms', '/refund-policy', '/privacy-policy']) assert.ok(footer.includes(`href="${href}"`));
 assert.ok(!html.includes('{{BUSINESS_'), 'Unrendered contact configuration: ' + file);
}
const contact = fs.readFileSync('dist/contact/index.html', 'utf8');
assert.ok(!/[\u0600-\u06ff]/.test(contact), 'Contact page should be English-only');
assert.ok(contact.includes(business.address), 'Contact page displays the configured address');
assert.ok(policies.includes(business.address), 'Terms page displays the configured address');
for (const route of ['contact', 'terms', 'refund-policy', 'privacy-policy']) {
 const html = fs.readFileSync(`dist/${route}/index.html`, 'utf8');
 assert.ok(!/Pending confirmation|Awaiting the owner/.test(html), route + ': no address placeholder displayed');
 assert.ok(!/[\u0600-\u06ff]/.test(html), route + ': English-only');
 assert.ok(html.includes('name="viewport"'), route + ': mobile viewport');
}
const refund = fs.readFileSync('dist/refund-policy/index.html', 'utf8');
const privacy = fs.readFileSync('dist/privacy-policy/index.html', 'utf8');
const refundContent = policies.match(/<h2 id="refund-policy"[^>]*>[\s\S]*?(?=<h2 id="privacy-policy")/)[0];
const privacyContent = policies.match(/<h2 id="privacy-policy"[^>]*>[\s\S]*?(?=<\/div><\/main>)/)[0];
assert.ok(refund.includes(refundContent), 'Refund wording must match /terms exactly');
assert.ok(privacy.includes(privacyContent), 'Privacy wording must match /terms exactly');
assert.equal((contact.match(/href="mailto:/g) || []).length, 2);
assert.equal((contact.match(/href="tel:/g) || []).length, 2);
assert.ok(renderBusiness('{{BUSINESS_ADDRESS_ROW}}{{BUSINESS_ADDRESS_PARAGRAPH}}').includes(business.address));
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
 for (const page of ['index.html','contact/index.html','terms/index.html','refund-policy/index.html','privacy-policy/index.html','account/index.html','blog/index.html','plan/demo-en/index.html','plan/demo-ar/index.html','admin/index.html']) {
  const html = fs.readFileSync(path.join('dist',page),'utf8');
  for (const [,src] of html.matchAll(/(?:src|href)="(\/[^"?#]*\.(?:js|css|png|svg|webmanifest))"/g)) {
   assert.ok(fs.existsSync(path.join('dist',src)), 'Missing asset: '+src);
  }
 }
 for (const post of context.window.REPVO_DATA.posts) assert.ok(fs.existsSync('dist/blog/'+post.slug+'/index.html'));
 for (const file of ['server.js','lib/db.js','assets/admin.js','assets/mock.js']) assert.ok(!fs.existsSync(path.join('dist',file)));
 console.log('Static checks passed: sample data, EN/AR plans, missing-plan handling, assets, article routes, and no backend in output.');
})().catch(err => { console.error(err); process.exitCode=1; });
