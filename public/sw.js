/* PACT service worker: Web Push only.
 *
 * It is registered when someone turns notifications on, never on first load, and it does nothing else:
 * no caching, no offline mode, no fetch handling. A push shows a short, discreet notification; tapping
 * it opens the right place inside PACT. If the person is signed out, the app's own sign-in brings them
 * back to that place afterwards. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

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
