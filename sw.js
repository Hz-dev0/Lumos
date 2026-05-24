const CACHE = 'lumos-v2';
const STATIC = [
  './manifest.json',
  './icon.png',
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap',
];

// 安裝：只預快取真正靜態的資源（不含 index.html）
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(STATIC))
      .then(() => self.skipWaiting()) // 立即接管，不等舊 SW 結束
  );
});

// 啟動：清除所有舊版快取
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fetch 策略
self.addEventListener('fetch', e => {
  const url = e.request.url;

  // 1. Firebase / 外部 API：永遠走網路，不快取
  if (
    url.includes('firestore.googleapis.com') ||
    url.includes('firebase') ||
    url.includes('gstatic.com') ||
    url.includes('identitytoolkit') ||
    url.includes('securetoken') ||
    url.includes('anthropic.com')
  ) {
    e.respondWith(fetch(e.request));
    return;
  }

  // 2. index.html（含 '/' 根路徑）：network-first，網路失敗才用快取
  if (
    url.endsWith('/') ||
    url.endsWith('/index.html') ||
    url === self.location.origin + '/'
  ) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' }) // 強制跳過瀏覽器 HTTP 快取
        .then(resp => {
          if (!resp || resp.status !== 200) throw new Error('bad response');
          // 更新快取中的 index.html
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return resp;
        })
        .catch(() => caches.match(e.request)) // 離線時才 fallback
    );
    return;
  }

  // 3. 其餘靜態資源（字型、圖示等）：cache-first，加速載入
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(resp => {
        if (!resp || resp.status !== 200 || resp.type === 'opaque') return resp;
        const clone = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return resp;
      });
    })
  );
});
