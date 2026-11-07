/* Service worker antigo de /escala/ — DESATIVADO.
   O portal AMT agora tem um service worker único na raiz (../service-worker.js),
   no mesmo esquema dos Apps CTV Campo. Os aparelhos que ainda têm este aqui
   instalado recebem esta versão na próxima checagem: ela apaga o próprio cache e
   se desregistra. A página então recarrega (app-update.js, protegendo campos em
   edição) e passa a ser controlada pelo service worker da raiz. */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('vulcaescala-amt-')).map((k) => caches.delete(k))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.claim())
      .catch(() => {}),
  );
});
