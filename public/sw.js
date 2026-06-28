/**
 * Service Worker — Pastelería POS
 * Estrategia:
 *  - Archivos con hash (assets/): cache-first (son inmutables)
 *  - HTML y resto: network-first con fallback a cache offline
 */
const CACHE_NAME = 'pasteleria-pos-v2';

// Archivos a pre-cachear en la instalación
const PRECACHE = ['/', '/index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Solo interceptar peticiones GET del mismo origen
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // La API nunca pasa por el SW: debe ir siempre a la red. Si la cacheáramos,
  // un fallo de red (p.ej. server arrancando) devolvería index.html en lugar
  // de JSON y la app cargaría con configuración por defecto (sin impresión).
  if (url.pathname.startsWith('/api/')) return;

  // Activos con hash (JS/CSS compilados): cache-first — nunca cambian
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response.ok) {
            caches.open(CACHE_NAME).then(c => c.put(request, response.clone()));
          }
          return response;
        });
      })
    );
    return;
  }

  // Navegación y recursos estáticos: network-first, fallback a cache
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          caches.open(CACHE_NAME).then(c => c.put(request, response.clone()));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then(cached =>
          cached || caches.match('/index.html')
        )
      )
  );
});
