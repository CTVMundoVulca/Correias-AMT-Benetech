/* Service Worker do portal AMT (página inicial e Medidas de Correias).
   Escala e Emenda têm service worker próprio nas pastas deles.
   Navegação: network-first com fallback para o cache (abre offline).
   CACHE_VERSION é gravado automaticamente no build (vulcaescala/scripts/build-all.mjs). */
const CACHE_VERSION = 'portal-amt-077db60c7d55';
const APP_SHELL = ['./', './index.html', './manifest.json', './medidas/', './medidas/index.html'];
const PROPRIOS = ['/escala/', '/emenda/']; // pastas com service worker próprio

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((c) => Promise.all(APP_SHELL.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => null))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('portal-amt-') && k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (PROPRIOS.some((p) => url.pathname.includes(p))) return;
  const nav = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (nav) {
    const rede = fetch(req).then((resp) => {
      const copia = resp.clone();
      caches.open(CACHE_VERSION).then((c) => c.put(req, copia)).catch(() => {});
      return resp;
    });
    const espera = new Promise((r) => setTimeout(() => r(null), 3000));
    const doCache = () => caches.match(req).then((r) => r || caches.match('./index.html'));
    event.respondWith(Promise.race([rede, espera]).then((r) => r || doCache()).catch(() => doCache()));
    return;
  }
  event.respondWith(
    caches.match(req).then((c) => c || fetch(req).then((resp) => {
      if (resp.ok) {
        const copia = resp.clone();
        caches.open(CACHE_VERSION).then((cc) => cc.put(req, copia)).catch(() => {});
      }
      return resp;
    }).catch(() => c)),
  );
});
