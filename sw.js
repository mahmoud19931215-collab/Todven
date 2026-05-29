// ==================== Service Worker لتطبيق توجفن – الإصدار المحسن ====================
const CACHE_NAME = 'togven-v3.0.2';
const API_CACHE_NAME = 'togven-api-v2';
const STATIC_CACHE_NAME = 'togven-static-v1';

const PRECACHE_URLS = [
  './',
  './index.html',
  './offline.html',
  './style.css',
  './app.js',
  './config.js',
  './StorageService.js',
  './ProductCard.js',
  './ProductsGrid.js',
  './CategoryManager.js',
  './CartManager.js',
  './ThemeManager.js',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://unpkg.com/dexie@3.2.4/dist/dexie.js'
];

// تثبيت الـ SW
self.addEventListener('install', event => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Pre-caching static assets');
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => self.skipWaiting())
      .catch(err => console.error('[SW] Pre-cache failed:', err))
  );
});

// تنشيط الـ SW وحذف الكاش القديم
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && 
              cacheName !== API_CACHE_NAME && 
              cacheName !== STATIC_CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Claiming clients');
      return self.clients.claim();
    })
  );
});

// استراتيجية Network First للـ API
async function networkFirstAPI(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      const responseClone = networkResponse.clone();
      const cache = await caches.open(API_CACHE_NAME);
      cache.put(request, responseClone);
      return networkResponse;
    }
    throw new Error('Network response not ok');
  } catch (error) {
    console.log('[SW] Network failed for API, trying cache:', request.url);
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    return new Response(
      JSON.stringify({ error: 'offline', message: 'لا يوجد اتصال بالإنترنت ولا توجد نسخة مخبأة' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// استراتيجية Cache First للصور
async function cacheFirstImage(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE_NAME);
      cache.put(request, networkResponse.clone());
      return networkResponse;
    }
    return networkResponse;
  } catch (error) {
    return new Response('', { status: 404 });
  }
}

// استراتيجية Stale While Revalidate للملفات الثابتة
async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE_NAME);
  const cachedResponse = await cache.match(request);
  
  const fetchPromise = fetch(request).then(networkResponse => {
    if (networkResponse && networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  }).catch(err => {
    console.log('[SW] Network failed for static asset:', request.url);
    return null;
  });
  
  return cachedResponse || fetchPromise;
}

// استراتيجية خاصة بصفحات HTML
async function handleHTMLRequest(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
      return networkResponse;
    }
    throw new Error('Network failed');
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    const offlinePage = await caches.match('./offline.html');
    return offlinePage || new Response('غير متصل بالإنترنت', { status: 503 });
  }
}

// اعتراض الطلبات
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  
  if (url.protocol === 'chrome-extension:' || url.protocol === 'moz-extension:') {
    return;
  }
  
  // API
  if (url.href.includes('script.google.com') || 
      url.href.includes('googleapis.com') ||
      url.href.includes('exec') ||
      url.pathname.includes('/api/')) {
    event.respondWith(networkFirstAPI(request));
    return;
  }
  
  // الصور
  if (request.destination === 'image') {
    event.respondWith(cacheFirstImage(request));
    return;
  }
  
  // HTML
  if (request.destination === 'document' || 
      request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(handleHTMLRequest(request));
    return;
  }
  
  // الملفات الثابتة
  if (request.destination === 'style' || 
      request.destination === 'script' ||
      request.destination === 'font' ||
      request.destination === 'manifest') {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
  
  // باقي الطلبات
  event.respondWith(
    caches.match(request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(request).then(networkResponse => {
        if (networkResponse && networkResponse.ok && request.method === 'GET') {
          const responseClone = networkResponse.clone();
          caches.open(STATIC_CACHE_NAME).then(cache => {
            cache.put(request, responseClone);
          });
        }
        return networkResponse;
      }).catch(() => new Response('Network error', { status: 503 }));
    })
  );
});

// الاستماع لرسائل من الصفحة الرئيسية
self.addEventListener('message', event => {
  const data = event.data;
  
  if (data?.action === 'clearCache') {
    console.log('[SW] Clearing all caches...');
    Promise.all([
      caches.delete(CACHE_NAME),
      caches.delete(API_CACHE_NAME),
      caches.delete(STATIC_CACHE_NAME)
    ]).then(() => {
      console.log('[SW] Caches cleared');
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ success: true });
      }
    }).catch(err => {
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ success: false, error: err.message });
      }
    });
    return;
  }
  
  if (data?.action === 'skipWaiting') {
    self.skipWaiting();
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ success: true });
    }
  }
});

// دعم Background Sync
self.addEventListener('sync', event => {
  if (event.tag === 'sync-cart') {
    event.waitUntil(Promise.resolve());
  }
});
