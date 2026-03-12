const CACHE_NAME = 'artstamp-v6';
const ASSETS = [
  './index.html',
  './manifest.json',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME && k !== 'artstamp-fonts').map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // GETのみキャッシュ対象（POST等は除外）
  if (event.request.method !== 'GET') return;

  // chrome-extension等の非httpスキームは無視
  if (!url.protocol.startsWith('http')) return;

  // API・外部サービス — キャッシュしない
  if (
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('opentimestamps.org') ||
    url.hostname.includes('calendar.eternitywall.com') ||
    url.hostname.includes('pagead2.googlesyndication.com') ||
    url.hostname.includes('googlesyndication.com') ||
    url.hostname.includes('doubleclick.net')
  ) {
    event.respondWith(
      fetch(event.request).catch(() => new Response('offline', { status: 503 }))
    );
    return;
  }

  // Google Fonts — ネットワーク優先、キャッシュにも保存
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.open('artstamp-fonts').then(cache =>
        fetch(event.request).then(response => {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        }).catch(() =>
          cache.match(event.request).then(cached => cached || new Response('', { status: 503 }))
        )
      )
    );
    return;
  }

  // それ以外（GET） — キャッシュ優先
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok) {
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
        }
        return response;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
