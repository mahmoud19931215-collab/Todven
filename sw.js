// ==================== Service Worker لتطبيق Togven ====================
const CACHE_NAME = 'togven-v1.0.1';
const OFFLINE_URL = '/offline.html';

// الملفات التي سيتم تخزينها مسبقاً (Pre-cache) - بدون الأيقونات المفقودة
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/offline.html',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://unpkg.com/dexie@3.2.4/dist/dexie.js',
  'https://cdn.jsdelivr.net/npm/promise-polyfill@8/dist/polyfill.min.js',
  'https://cdn.jsdelivr.net/npm/whatwg-fetch@3.6.2/dist/fetch.umd.js'
];

// تثبيت Service Worker وتخزين الملفات الأساسية
self.addEventListener('install', event => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching app shell');
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => self.skipWaiting())
  );
});

// تفعيل Service Worker وتنظيف الكاش القديم
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// استراتيجية: Cache First للملفات الثابتة، Network First لواجهة API
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // طلب API الخاص بالبيانات (استراتيجية Network First)
  if (url.href.includes('script.google.com') || url.href.includes('exec')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clonedResponse = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, clonedResponse);
          });
          return response;
        })
        .catch(() => {
          return caches.match(request).then(cached => {
            if (cached) return cached;
            return new Response(JSON.stringify({ error: 'offline' }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            });
          });
        })
    );
    return;
  }

  // طلب الصور (استراتيجية Cache First)
  if (request.destination === 'image') {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, cloned));
          return response;
        }).catch(() => {
          return new Response('', { status: 404 });
        });
      })
    );
    return;
  }

  // بقية الملفات (HTML, CSS, JS) استراتيجية Cache First ثم Network
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response.ok && request.method === 'GET') {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, cloned));
        }
        return response;
      }).catch(() => {
        if (request.headers.get('accept').includes('text/html')) {
          return caches.match(OFFLINE_URL);
        }
        return new Response('⚠️ أنت غير متصل بالإنترنت', { status: 503 });
      });
    })
  );
});

// معالجة رسائل من صفحة التطبيق
self.addEventListener('message', event => {
  if (event.data && event.data.action === 'clearCache') {
    caches.delete(CACHE_NAME).then(() => {
      console.log('[SW] Cache cleared by user');
      event.ports[0].postMessage({ success: true });
    });
  }
});
