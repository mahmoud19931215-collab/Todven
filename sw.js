// ==================== Service Worker لتطبيق توجفن (نسخة الجذر) ====================
const CACHE_NAME = 'togven-v2.1.0';   // ← رُفع الإصدار لمسح الكاش القديم تلقائياً
const OFFLINE_URL = '/offline.html';
const API_CACHE_NAME = 'togven-api-v1';
const IMAGE_CACHE_NAME = 'togven-images-v1';  // ← كاش مستقل للصور

// الملفات الأساسية في الجذر فقط
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/offline.html',
  '/config.js',
  '/StorageService.js',
  '/ProductCard.js',
  '/ProductsGrid.js',
  '/CategoryManager.js',
  '/CartManager.js',
  '/ThemeManager.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://unpkg.com/dexie@3.2.4/dist/dexie.js'
];

self.addEventListener('install', event => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME && cache !== API_CACHE_NAME && cache !== IMAGE_CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // ========== API (Network First) ==========
  if (url.href.includes('script.google.com') || url.href.includes('exec')) {
    event.respondWith(
      fetch(request).then(response => {
        const cloned = response.clone();
        caches.open(API_CACHE_NAME).then(cache => cache.put(request, cloned));
        return response;
      }).catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        return new Response(JSON.stringify({ error: 'offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // ========== الصور (Cache First — جودة أصلية كاملة) ==========
  if (request.destination === 'image') {
    event.respondWith(
      caches.open(IMAGE_CACHE_NAME).then(async imageCache => {
        // ابحث في كاش الصور أولاً
        const cached = await imageCache.match(request);
        if (cached) return cached; // ⚡ فوري من الكاش بجودة أصلية

        // غير موجود — اجلب من الشبكة واحفظه
        try {
          const response = await fetch(request, { mode: 'cors' });
          if (response.ok) {
            // احفظ نسخة كاملة بجودة أصلية بدون أي معالجة
            imageCache.put(request, response.clone());
          }
          return response;
        } catch {
          // إذا فشل الجلب ابحث في الكاش العام كخطة بديلة
          const fallback = await caches.match(request);
          return fallback || new Response('', { status: 404 });
        }
      })
    );
    return;
  }

  // ========== الباقي (Cache First ثم Network) ==========
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response.ok && request.method === 'GET') {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, cloned));
        }
        return response;
      }).catch(async () => {
        if (request.headers.get('accept')?.includes('text/html')) {
          return caches.match(OFFLINE_URL);
        }
        return new Response('⚠️ غير متصل', { status: 503 });
      });
    })
  );
});

self.addEventListener('message', event => {
  if (event.data?.action === 'clearCache') {
    Promise.all([
      caches.delete(CACHE_NAME),
      caches.delete(API_CACHE_NAME),
      caches.delete(IMAGE_CACHE_NAME)   // ← مسح كاش الصور أيضاً
    ]).then(() => {
      console.log('[SW] All caches cleared');
      if (event.ports[0]) event.ports[0].postMessage({ success: true });
    });
  }
});
