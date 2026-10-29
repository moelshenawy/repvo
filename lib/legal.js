// Keep /terms as the single source of policy wording for every public route.
function policyPage(terms, policy) {
  const refund = policy === 'refund-policy';
  if (!refund && policy !== 'privacy-policy') throw new Error('Unknown policy');
  const title = refund ? 'Refund Policy' : 'Privacy Policy';
  const section = refund
    ? terms.match(/<h2 id="refund-policy"[^>]*>[\s\S]*?(?=<h2 id="privacy-policy")/)
    : terms.match(/<h2 id="privacy-policy"[^>]*>[\s\S]*?(?=<\/div><\/main>)/);
  if (!section) throw new Error(`Missing ${policy} content in /terms`);
  const nav = '<nav class="business-links" aria-label="Legal pages"><a href="/refund-policy">Refund Policy</a><a href="/terms">Terms</a><a href="/privacy-policy">Privacy Policy</a><a href="/contact">Contact</a></nav>';
  return terms.replace(/<title>.*?<\/title>/, `<title>${title} · Repvo</title>`)
    .replace(/<main[\s\S]*?<\/main>/, `<main class="band"><div class="inner narrow"><h1 class="h2">${title}</h1>${nav}${section[0]}</div></main>`);
}

module.exports = { policyPage };
