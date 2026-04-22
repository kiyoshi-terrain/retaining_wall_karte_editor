const CACHE_NAME = 'rw-karte-v45-chunked-base64';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

const CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js',
  'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
  'https://cdn.jsdelivr.net/npm/piexifjs@1.0.6/piexif.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(ASSETS);
      for (const url of CDN_ASSETS) {
        try {
          await cache.add(url);
        } catch (err) {
          console.warn('CDN cache failed (will retry online):', url, err);
        }
      }
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Google APIs (OAuth, Drive) は常にネットワーク（キャッシュしない）
  if (url.hostname.includes('googleapis.com') || url.hostname.includes('accounts.google.com')) {
    return;
  }

  // Network-first: オンラインなら最新を取得、オフラインならキャッシュ
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
