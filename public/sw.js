/* ============================================================
   sw.js — service worker de PRESENCE·OS

   Solo cachea la carcasa estática (HTML, CSS, JS, iconos) para que el
   dashboard abra al instante y siga siendo usable si la red falla un
   momento.

   Lo que NUNCA se cachea, y es lo importante:
     · /api/*, /oauth2/*, /socket.io/* y cualquier otra ruta.
       Son datos vivos: el token, la presencia y el estado del RPC. Servir
       una versión guardada haría que el dashboard pareciera real
       mientras Discord ya no lo está.
     · public/uploads, que son las imágenes que el usuario sube.

   El token vive en el servidor: el service worker nunca lo ve.
   ============================================================ */

const CACHE = 'presence-os-v1';

/* La carcasa: lo mínimo para pintar la interfaz. */
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      /* addAll falla entero si un recurso falta; se tolera uno a uno. */
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/* Rutas que siempre van a la red, sin tocar la caché. */
function isLive(url) {
  if (url.pathname.startsWith('/api/')) return true;
  if (url.pathname.startsWith('/oauth2/')) return true;
  if (url.pathname.startsWith('/socket.io/')) return true;
  if (url.pathname.startsWith('/uploads/')) return true;
  if (url.pathname === '/health' || url.pathname === '/') return url.search.length > 0;
  return false;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;

  /* Solo GET: una escritura nunca se sirve desde caché. */
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }

  if (url.origin !== self.location.origin) return;
  if (isLive(url)) return;

  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) {
        /* Con red disponible se refresca en segundo plano. */
        event.waitUntil(
          fetch(req)
            .then((res) => (res && res.ok ? caches.open(CACHE).then((c) => c.put(req, res)) : null))
            .catch(() => {}),
        );
        return hit;
      }
      return fetch(req)
        .then((res) => {
          if (res && res.ok && res.type === 'basic') {
            const copy = res.clone();
            event.waitUntil(caches.open(CACHE).then((c) => c.put(req, copy)));
          }
          return res;
        })
        .catch(() => caches.match('/index.html'));
    }),
  );
});