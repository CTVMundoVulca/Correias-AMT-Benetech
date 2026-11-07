/* Service Worker — Registro de Emenda (contrato AMT)
   Mesmo esquema dos apps CTV Campo: app shell em cache; navegação network-first
   (pega atualização quando há rede) com fallback para o cache (offline).
   CACHE_VERSION é gravado automaticamente no build (scripts/stamp-sw.mjs). */
const CACHE_VERSION = 'emenda-amt-dev';

const APP_SHELL = [
  './',
  './index.html',
  './app-update.js',
  './manifest.json',
  './logo-benetech.png',
  './logo-ctv.webp',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './apple-touch-icon.png'
];

/* SDK do Firebase (mesma versão dos apps CTV): guardado para abrir offline */
const SDK_PREFIX = 'https://www.gstatic.com/firebasejs/';

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => Promise.all(APP_SHELL.map(url =>
        cache.add(new Request(url, { cache: 'reload' })).catch(() => null)
      )))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(k => k.startsWith('emenda-amt-') && k !== CACHE_VERSION)
        .map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  // Firestore/Auth (conexões ao vivo) nunca passam pelo cache
  if (!sameOrigin && !req.url.startsWith(SDK_PREFIX)) return;

  const isNavigation = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isNavigation) {
    // network-first com timeout de 3s — sinal fraco serve do cache rápido
    const fromNetwork = fetch(req).then(resp => {
      const copy = resp.clone();
      caches.open(CACHE_VERSION).then(c => c.put(req, copy)).catch(() => {});
      return resp;
    });
    const timeout = new Promise(resolve => setTimeout(() => resolve(null), 3000));
    const fromCache = () => caches.match(req).then(r => r || caches.match('./index.html'));
    event.respondWith(
      Promise.race([fromNetwork, timeout])
        .then(resp => resp || fromCache())
        .catch(() => fromCache())
    );
    return;
  }

  // cache-first para os demais assets (app shell e SDK do Firebase)
  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(resp => {
      if (resp.ok) {
        const copy = resp.clone();
        caches.open(CACHE_VERSION).then(c => c.put(req, copy)).catch(() => {});
      }
      return resp;
    }).catch(() => cached))
  );
});
