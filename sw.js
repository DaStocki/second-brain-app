// Caches only the app shell; GitHub API calls always go to the network.
const CACHE = 'sb-app-v11';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});

// Web push: evening check-in reminder sent by the vault's GitHub Action.
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {} } catch { d = {body: e.data && e.data.text()} }
  e.waitUntil(self.registration.showNotification(d.title || 'Second Brain', {body: d.body || '', icon: 'icon.svg', badge: 'icon.svg', tag: d.tag, data: {url: d.url || './'}}));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data && e.notification.data.url || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(list => {
    for (const c of list) if (c.url.startsWith(self.registration.scope)) { c.navigate(url).catch(() => {}); return c.focus() }
    return self.clients.openWindow(url);
  }));
});
