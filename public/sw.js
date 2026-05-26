const STATIC_CACHE = 'withlog-static-v2';
const HTML_CACHE = 'withlog-html-v2';
const KEEP_CACHES = [STATIC_CACHE, HTML_CACHE];

const STATIC_DESTINATIONS = new Set([
  'style',
  'script',
  'worker',
  'font',
  'image',
  'manifest',
]);

const STATIC_PATH_REGEX = /\.(?:js|mjs|css|woff2?|ttf|otf|eot|png|jpg|jpeg|gif|svg|webp|avif|ico)$/i;

function isSameOrigin(url) {
  try {
    return new URL(url).origin === self.location.origin;
  } catch {
    return false;
  }
}

function isStaticAsset(request) {
  if (!isSameOrigin(request.url)) return false;
  if (STATIC_DESTINATIONS.has(request.destination)) return true;
  const path = new URL(request.url).pathname;
  return STATIC_PATH_REGEX.test(path);
}

self.addEventListener('install', (event) => {
  // Activate the new SW immediately on install
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => !KEEP_CACHES.includes(n)).map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET — never touch writes (POST/PATCH/DELETE/etc.)
  if (request.method !== 'GET') return;

  // Cross-origin (e.g. Supabase API, storage, Google Maps): Network Only,
  // never cache dynamic data.
  if (!isSameOrigin(request.url)) return;

  // HTML navigations: Network First, fall back to cache only when offline.
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(HTML_CACHE);
          cache.put(request, fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match(request);
          if (cached) return cached;
          const shell = await caches.match('/');
          if (shell) return shell;
          return new Response('Offline', { status: 503, statusText: 'Offline' });
        }
      })(),
    );
    return;
  }

  // Static assets: Cache First.
  if (isStaticAsset(request)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(STATIC_CACHE);
          cache.put(request, response.clone());
        }
        return response;
      })(),
    );
    return;
  }

  // Everything else (same-origin API routes, etc.): Network Only.
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'CLEAR_DATA_CACHE') {
    event.waitUntil(
      (async () => {
        // Drop HTML cache so the next navigation re-fetches from network.
        // Static assets (hashed JS/CSS, fonts, icons) remain cached.
        await caches.delete(HTML_CACHE);
      })(),
    );
  }

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});