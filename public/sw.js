const CACHE_NAME = 'lb-eqsl-express-shell-v3';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    // Cache the built JS/CSS referenced by index.html too. Caching only HTML
    // caused a blank screen when the installed app launched without a connection.
    const response = await fetch('/index.html', { cache: 'reload' });
    if (response.ok) {
      const html = await response.clone().text();
      const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css)(?:\?[^"]*)?)"/g)]
        .map((match) => new URL(match[1], self.location.origin).href)
        .filter((url) => new URL(url).origin === self.location.origin);
      await Promise.all(assets.map(async (url) => {
        try {
          const asset = await fetch(url, { cache: 'reload' });
          if (asset.ok) await cache.put(url, asset);
        } catch { /* Keep installation usable even if a noncritical asset fails. */ }
      }));
      await cache.put('/index.html', response);
    }
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith('lb-eqsl-express-shell-') && key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put('/index.html', response.clone());
        }
        return response;
      } catch {
        return (await caches.match('/index.html')) || (await caches.match('/'));
      }
    })());
    return;
  }

  // Serve built app assets from cache when offline, refreshing them when online.
  if (/\.(?:js|css|svg|png|jpe?g|webp|woff2?)(?:$|\?)/i.test(url.pathname)) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      const network = fetch(request).then(async (response) => {
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      }).catch(() => null);
      return cached || await network || new Response('', { status: 504, statusText: 'Offline asset unavailable' });
    })());
  }
});
