/* PACT service worker: Web Push, plus one offline fallback page.
 *
 * Caching is deliberately minimal. The only thing stored is /offline.html, shown when a page navigation
 * fails because there is no connection. Nothing else is cached or intercepted: API calls, signed-in
 * pages, money screens and assets always go straight to the network, so nothing private is ever kept
 * on the device by this worker. A push shows a short, discreet notification; tapping it opens the right
 * place inside PACT. If the person is signed out, the app's own sign-in brings them back to that place
 * afterwards. */

const OFFLINE_CACHE = 'pact-offline-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' })))
      .catch(() => undefined) // a failed precache must not block the worker (push still works)
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener('activate', (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== OFFLINE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  ),
);

self.addEventListener('fetch', (event) => {
  // Page loads only. Everything else is left to the browser, untouched.
  if (event.request.mode !== 'navigate') return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(OFFLINE_URL).then((res) => res || Response.error())),
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    /* a malformed push still shows something generic */
  }
  const url = typeof data.url === 'string' && /^\/app(\/|$)/.test(data.url) ? data.url : '/app/notifications';
  event.waitUntil(
    self.registration.showNotification(typeof data.title === 'string' ? data.title : 'PACT', {
      body: typeof data.body === 'string' ? data.body : 'You have an update.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-48.png',
      // One notification per place, so a burst of updates about the same Pact replaces rather than stacks.
      tag: url,
      renotify: false,
      data: { url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/app/notifications', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      // Reuse an open PACT tab: focus it and move it to the place, instead of piling up tabs.
      for (const w of windows) {
        if (new URL(w.url).origin === self.location.origin && 'focus' in w) {
          return w.focus().then(() => ('navigate' in w ? w.navigate(target) : undefined));
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
