
// ==================== Service Worker لتطبيق Togven ====================
const CACHE_NAME = 'togven-v1.0.0';
const OFFLINE_URL = '/offline.html'; // سيتم إنشاؤها لاحقاً

// الملفات التي سيتم تخزينها مسبقاً (Pre-cache)
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://unpkg.com/dexie@3.2.4/dist/dexie.js'
];

// أيقونات PWA (إذا كانت موجودة)
const ICON_URLS = [
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// دمج الأيقونات مع الملفات الأساسية
const ALL_CACHE_URLS = [...PRECACHE_URLS, ...ICON_URLS];

// تثبيت Service Worker وتخزين الملفات الأساسية
self.addEventListener('install', event => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching app shell');
        return cache.addAll(ALL_CACHE_URLS);
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
          // تخزين نسخة من API في الكاش مؤقتاً (لمدة ساعة)
          const clonedResponse = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, clonedResponse);
          });
          return response;
        })
        .catch(() => {
          // إذا فشل الشبكة، أحضر من الكاش (إن وجد)
          return caches.match(request).then(cached => {
            if (cached) return cached;
            // إذا لم يكن هناك كاش، أعد استجابة مخصصة
            return new Response(JSON.stringify({ error: 'offline' }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            });
          });
        })
    );
    return;
  }

  // طلب الصور والمجلدات /icons/ (استراتيجية Cache First)
  if (request.destination === 'image' || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, cloned));
          return response;
        }).catch(() => {
          // صورة افتراضية في حالة عدم الاتصال
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
        // تخزين نسخة فقط للملفات الناجحة
        if (response.ok && request.method === 'GET') {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, cloned));
        }
        return response;
      }).catch(() => {
        // إذا كان الطلب لصفحة HTML، أعد صفحة offline
        if (request.headers.get('accept').includes('text/html')) {
          return caches.match(OFFLINE_URL);
        }
        return new Response('⚠️ أنت غير متصل بالإنترنت', { status: 503 });
      });
    })
  );
});

// معالجة رسائل من صفحة التطبيق (مثل طلب مسح الكاش)
self.addEventListener('message', event => {
  if (event.data && event.data.action === 'clearCache') {
    caches.delete(CACHE_NAME).then(() => {
      console.log('[SW] Cache cleared by user');
      event.ports[0].postMessage({ success: true });
    });
  }
});
