const V = 'ml-4.5.1';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon-v2.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  const put = r => { if (r && r.ok) { const c = r.clone(); caches.open(V).then(ca => ca.put(e.request, c)); } return r; };
  // Fichiers versionnés (app.js?v=…, styles.css?v=…) et images : depuis l'iPhone, instantané
  if (u.searchParams.has('v') || /\.(png|svg|webmanifest)$/.test(u.pathname)) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(put)));
    return;
  }
  // Page et version.json : réseau d'abord (pour les mises à jour), mais pas plus de 2,5 s si le réseau est lent
  const net = fetch(e.request, { cache: 'no-cache' }).then(put);
  const fallback = () => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'));
  e.respondWith(new Promise(resolve => {
    let done = false;
    const t = setTimeout(() => fallback().then(r => { if (!done && r) { done = true; resolve(r); } }), 2500);
    net.then(r => { if (!done) { done = true; clearTimeout(t); resolve(r); } }).catch(() => fallback().then(r => { if (!done) { done = true; clearTimeout(t); resolve(r || Response.error()); } }));
  }));
});

/* Notifications envoyées par le relais : affichage + pastille */
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { title: 'MailBox', body: e.data ? e.data.text() : '' }; }
  // Prévient l'app ouverte pour qu'elle rafraîchisse sa liste
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => cs.forEach(c => c.postMessage({ type: 'mail' }))).catch(() => {}));
  if (d.type === 'badge') {
    // Mise à jour de la pastille seule : iOS impose une notification, on l'affiche sans bruit puis on la retire aussitôt
    const n = d.badge || 0;
    e.waitUntil(Promise.all([
      self.navigator && self.navigator.setAppBadge ? (n ? self.navigator.setAppBadge(n) : self.navigator.clearAppBadge()).catch(() => {}) : null,
      self.registration.showNotification('MailBox', { body: n ? n + ' non lu' + (n > 1 ? 's' : '') : 'Tout est lu', tag: 'mailbox-badge', silent: true, renotify: false, icon: 'icon-192.png' })
        .then(() => self.registration.getNotifications({ tag: 'mailbox-badge' })).then(ns => ns.forEach(x => x.close())).catch(() => {})
    ]));
    return;
  }
  const jobs = [self.registration.showNotification(d.title || 'MailBox', { body: d.body || '', tag: d.tag || 'mailbox', renotify: !d.silent, silent: !!d.silent, icon: 'icon-192.png', badge: 'icon-192.png', data: { url: d.url || './' } })];
  if (typeof d.badge === 'number' && self.navigator && self.navigator.setAppBadge) jobs.push((d.badge ? self.navigator.setAppBadge(d.badge) : self.navigator.clearAppBadge()).catch(() => {}));
  e.waitUntil(Promise.all(jobs));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) { if ('focus' in c) { if (c.navigate) c.navigate(url).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
