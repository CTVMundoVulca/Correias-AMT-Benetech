/* Service Worker ÚNICO do portal AMT — mesmo esquema dos Apps CTV Campo.
   Controla todos os módulos (portal, Escala, Emenda, Programação e Medidas) com uma só versão:
   qualquer publicação muda o CACHE_VERSION e todos os aparelhos se atualizam
   sozinhos (app-update.js). Navegação = network-first com fallback para o cache
   (abre offline); demais arquivos = cache-first.
   CACHE_VERSION é gravado automaticamente no build (vulcaescala/scripts/build-all.mjs),
   a partir do conteúdo de todos os arquivos do APP_SHELL. */
const CACHE_VERSION = 'amt-39f222d2003a';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './app-update.js',
  './medidas/',
  './medidas/index.html',
  './escala/',
  './escala/index.html',
  './escala/logo-benetech.png',
  './escala/logo-ctv.webp',
  './escala/icon-192.png',
  './escala/icon-512.png',
  './escala/icon-512-maskable.png',
  './escala/apple-touch-icon.png',
  './emenda/',
  './emenda/index.html',
  './emenda/logo-benetech.png',
  './emenda/logo-ctv.webp',
  './programacao/',
  './programacao/index.html',
  './programacao/logo-benetech.png',
  // link exclusivo das áreas do cliente
  './areas/',
  './areas/index.html',
  './areas/manifest.json',
  './areas/logo-benetech.png',
  // geração de PDF no aparelho (mesmas bibliotecas dos Apps CTV Campo)
  './vendor/html2canvas.min.js',
  './vendor/jspdf.umd.min.js',
];

/* SDK do Firebase (mesma versão dos apps CTV): guardado para abrir offline */
const SDK_PREFIX = 'https://www.gstatic.com/firebasejs/';

/* O domínio ctvmundovulca.github.io é compartilhado com outros apps CTV:
   só apagamos caches deste portal (inclusive os dos service workers antigos). */
const MEUS_CACHES = ['amt-', 'portal-amt-', 'vulcaescala-amt-', 'emenda-amt-'];

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => Promise.all(APP_SHELL.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => null))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((k) => k !== CACHE_VERSION && MEUS_CACHES.some((p) => k.startsWith(p)))
        .map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/* página inicial de cada módulo, para abrir offline */
function paginaDoModulo(url) {
  for (const m of ['escala', 'emenda', 'programacao', 'areas', 'medidas']) if (url.pathname.includes('/' + m + '/')) return './' + m + '/index.html';
  return './index.html';
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Firestore/Auth (conexões ao vivo) nunca passam pelo cache
  if (url.origin !== self.location.origin && !req.url.startsWith(SDK_PREFIX)) return;

  const nav = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (nav) {
    // network-first com timeout de 3 s — sinal fraco serve do cache rápido
    // 'no-cache': revalida com o servidor em vez de usar a cópia HTTP do navegador
    // (o GitHub Pages manda guardar por 10 min, o que atrasaria a atualização)
    const rede = fetch(req, { cache: 'no-cache' }).then((resp) => {
      if (resp.ok) {
        const copia = resp.clone();
        caches.open(CACHE_VERSION).then((c) => c.put(req, copia)).catch(() => {});
      }
      return resp;
    });
    const espera = new Promise((r) => setTimeout(() => r(null), 3000));
    const doCache = () => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match(paginaDoModulo(url)));
    event.respondWith(Promise.race([rede, espera]).then((r) => r || doCache()).catch(() => doCache()));
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((resp) => {
      if (resp.ok) {
        const copia = resp.clone();
        caches.open(CACHE_VERSION).then((c) => c.put(req, copia)).catch(() => {});
      }
      return resp;
    }).catch(() => cached)),
  );
});
