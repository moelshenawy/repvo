(function () {
  'use strict';
  const data = window.REPVO_DATA;
  const clone = value => JSON.parse(JSON.stringify(value));
  async function request(input, options = {}) {
    const url = new URL(input, location.origin);
    const route = url.pathname;
    if (route === '/api/config') return clone(data.config);
    if (route === '/api/foods') return clone(data.foods.filter(f => f.cat !== 'other' && (f.reg === 'all' || f.reg === url.searchParams.get('region'))));
    if (route === '/api/team') return clone(data.team);
    if (route === '/api/blog') return clone(data.posts.slice(0, Number(url.searchParams.get('limit')) || 20));
    if (route === '/api/slots') {
      // Illustrative availability only; selecting a time never reserves it.
      const slots = [];
      for (let day = 1; day <= 14; day++) for (const hour of [10, 12, 15, 18]) {
        const date = new Date(); date.setDate(date.getDate() + day); date.setHours(hour, 0, 0, 0);
        slots.push({ ts: date.getTime(), taken: hour === 12 && day % 3 === 0 });
      }
      return slots;
    }
    if (route === '/api/checkout') {
      const body = JSON.parse(options.body || '{}');
      return { url: '/plan/demo-' + (body.intake?.lang === 'ar' ? 'ar' : 'en') };
    }
    const match = route.match(/^\/api\/order\/(demo-(?:en|ar))$/);
    if (match) return clone(data.orders[match[1]]);
    throw Object.assign(new Error('This feature is unavailable in the static preview.'), { status: 404 });
  }
  async function response(url, options) {
    try { return new Response(JSON.stringify(await request(url, options)), { headers: { 'Content-Type': 'application/json' } }); }
    catch (err) { return new Response(JSON.stringify({ error: err.message }), { status: err.status || 400, headers: { 'Content-Type': 'application/json' } }); }
  }
  window.StaticDemo = { request, response };
  if (document.body.dataset.page === 'blog') {
    const root = document.getElementById('root');
    const slug = location.pathname.replace(/\/+$/, '').split('/')[2];
    const B = window.BLOG;
    if (slug) {
      const post = data.posts.find(p => p.slug === decodeURIComponent(slug));
      if (!post) { root.innerHTML = '<div class="panel sec"><h1>Article not found</h1><a href="/blog">All articles</a></div>'; return; }
      document.title = post.title + ' · Repvo';
      document.documentElement.lang = post.lang;
      root.innerHTML = B.postHTML(post, { url: location.href, related: B.relatedPosts(post, data.posts) });
    } else {
      const params = new URLSearchParams(location.search);
      const lang = ['en', 'ar'].includes(params.get('lang')) ? params.get('lang') : null;
      root.innerHTML = '<div class="bloghead"><p class="eyebrow">Blog</p><h1 class="h2">Train smarter. Eat smarter.</h1><p class="sub2">Sample articles from the Repvo library.</p></div>' + B.indexHTML(data.posts, { lang, tag: params.get('tag') || '', q: params.get('q') || '' });
    }
  }
})();
