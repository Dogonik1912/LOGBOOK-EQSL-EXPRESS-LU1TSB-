const CACHE_NAME = 'lb-eqsl-express-shell-v7';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg', '/logbook-header.svg'];

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
      // Network-first while online: do not let an old cached asset mask a newer release.
      // The cached copy is only the offline fallback.
      try {
        const response = await fetch(request, { cache: 'no-cache' });
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
          return response;
        }
      } catch { /* Offline: use the last cached copy below. */ }
      const cached = await caches.match(request);
      return cached || new Response('', { status: 504, statusText: 'Offline asset unavailable' });
    })());
  }
});


// Push notifications for incoming eQSL cards.
self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let data = {};
    try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
    const title = data.title || 'LogBook eQSL EXPRESS';

    // The Badging API is optional; never let it prevent the notification itself.
    try {
      if (Object.prototype.hasOwnProperty.call(data, 'unreadCount')) {
        const count = Math.max(0, Number(data.unreadCount) || 0);
        if (count > 0 && typeof self.navigator?.setAppBadge === 'function') {
          await self.navigator.setAppBadge(count);
        } else if (count === 0 && typeof self.navigator?.clearAppBadge === 'function') {
          await self.navigator.clearAppBadge();
        }
      }
    } catch { /* Badge support varies by browser and operating system. */ }

    const options = {
      body: data.body || 'Has recibido una nueva eQSL.',
      icon: '/icon.svg',
      badge: '/icon.svg',
      tag: data.tag || 'eqsl-incoming',
      renotify: true,
      data: { url: data.url || '/?open_eqsl_inbox=1' },
      // Leave silent=false by default so the OS may play its notification sound.
      silent: data.silent === true,
    };
    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (client.url.startsWith(self.location.origin) && 'focus' in client) {
        await client.focus();
        if (new URL(target).searchParams.has('open_private_messages')) {
          client.postMessage({ type: 'OPEN_PRIVATE_MESSAGES' });
        } else {
          client.postMessage({ type: 'OPEN_EQSL_INBOX' });
        }
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});
