// Funciona sem internet: guarda o sistema no aparelho e busca a versão nova quando houver internet.
const CACHE = 'sistema-assistencia-v1';
const ARQS = ['./', 'index.html', 'manifest.webmanifest', 'icone-192.png', 'icone-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQS))); self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(fetch(r).then(resp => { const c = resp.clone(); caches.open(CACHE).then(k => k.put(r, c)); return resp; })
    .catch(() => caches.match(r, { ignoreSearch: true }).then(x => x || caches.match('index.html'))));
});
