const CACHE_NAME = 'lb-eqsl-express-shell-v14';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg', '/logbook-header.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    // Cache each shell resource independently so one optional file cannot
    // prevent the new worker from downloading the next app version.
    await Promise.all(APP_SHELL.map(async (path) => {
      try {
        const response = await fetch(path, { cache: 'reload' });
        if (response.ok) await cache.put(path, response);
      } catch { /* Keep installing if an optional resource is unavailable. */ }
    }));

    // Pre-cache the exact versioned JS/CSS referenced by the freshly fetched HTML.
    try {
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
          } catch { /* The new worker can still wait safely for activation. */ }
        }));
        await cache.put('/index.html', response);
      }
    } catch { /* Do not fail installation because of a temporary network issue. */ }
  })());

  // Intentionally do NOT call skipWaiting(): existing sessions keep their
  // current worker and app code until every old client has naturally closed.
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Activation only happens after the previous worker has no controlled
    // clients, so old shell caches can now be retired safely.
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith('lb-eqsl-express-shell-') && key !== CACHE_NAME)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Serve the installed app shell from its local cache first. Refresh it in
  // the background so the next launch gets the newest HTML without delaying
  // this launch or interrupting an active session.
  if (request.mode === 'navigate') {
    // Network-first for page navigation: every new entry prefers the current
    // production HTML, avoiding stale desktop shells. Keep the last good shell
    // as an offline fallback without interrupting an already-open session.
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request, { cache: 'no-store' });
        if (response.ok) {
          await cache.put('/index.html', response.clone());
          await cache.put('/', response.clone());
        }
        return response;
      } catch {
        const cached = await cache.match('/index.html') || await cache.match('/');
        return cached || new Response('LogBook no está disponible sin conexión todavía.', { status: 503 });
      }
    })());
    return;
  }

  if (/\.(?:js|css|svg|png|jpe?g|webp|woff2?)(?:$|\?)/i.test(url.pathname)) {
    const refresh = caches.open(CACHE_NAME).then(async (cache) => {
      const response = await fetch(request, { cache: 'no-cache' });
      if (response.ok) await cache.put(request, response.clone());
      return response;
    });
    event.waitUntil(refresh.then(() => undefined).catch(() => undefined));
    event.respondWith(caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request) || await cache.match(request, { ignoreSearch: true });
      if (cached) return cached;
      try { return await refresh; }
      catch { return new Response('', { status: 504, statusText: 'Offline asset unavailable' }); }
    }));
  }
});

// Push notifications for incoming eQSL cards.
self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let data = {};
    try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
    const title = data.title || 'LogBook eQSL EXPRESS';

    try {
      if (Object.prototype.hasOwnProperty.call(data, 'unreadCount')) {
        const count = Math.max(0, Number(data.unreadCount) || 0);
        if (count > 0 && typeof self.navigator?.setAppBadge === 'function') {
          await self.navigator.setAppBadge(count);
        } else if (count === 0 && typeof self.navigator?.clearAppBadge === 'function') {
          await self.navigator.clearAppBadge();
        }
      }
    } catch { /* Badge support is optional. */ }

    await self.registration.showNotification(title, {
      body: data.body || 'Has recibido una nueva eQSL.',
      icon: '/icon.svg',
      badge: '/icon.svg',
      tag: data.tag || 'eqsl-incoming',
      renotify: true,
      data: { url: data.url || '/?open_eqsl_inbox=1', room: data.room || null },
      silent: data.silent === true,
    });
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
        const targetUrl = new URL(target);
        const lbRoom = targetUrl.searchParams.get('open_lb_comunica');
        if (lbRoom === 'ham' || lbRoom === '11m') {
          client.postMessage({ type: 'OPEN_LB_COMUNICA', room: lbRoom });
        } else if (targetUrl.searchParams.has('open_private_messages')) {
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
