// ==================== Service Worker لتطبيق توجفن - الإصدار المحسن ====================
const CACHE_NAME = 'togven-v3.0.0';
const API_CACHE_NAME = 'togven-api-v2';
const STATIC_CACHE_NAME = 'togven-static-v1';

// استخدام مسارات نسبية للتوافق مع النشر في مجلدات فرعية
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

// استثناءات للمسارات التي لا يجب تخزينها مؤقتاً (مثل التحليلات)
const EXCLUDED_URLS = [
  'chrome-extension',
  'firefox-settings',
  'google-analytics'
];

// التحقق مما إذا كان المسار مستثنى
function isExcluded(url) {
  return EXCLUDED_URLS.some(excluded => url.includes(excluded));
}

// تثبيت الـ SW
self.addEventListener('install', event => {
  console.log('[SW] Installing new version...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Pre-caching static assets');
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => {
        console.log('[SW] Pre-cache completed');
        return self.skipWaiting();
      })
      .catch(err => {
        console.error('[SW] Pre-cache failed:', err);
      })
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
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      const cache = await caches.open(API_CACHE_NAME);
      cache.put(request, networkResponse.clone());
      return networkResponse;
    }
    throw new Error('Network response not ok');
  } catch (error) {
    console.log('[SW] Network failed, trying cache for:', request.url);
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    return new Response(
      JSON.stringify({ error: 'offline', message: 'لا يوجد اتصال بالإنترنت' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// استراتيجية Cache First للصور
async function cacheFirst(request) {
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
    // صورة placeholder
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
    console.log('[SW] Network failed for:', request.url);
    return null;
  });
  
  return cachedResponse || fetchPromise;
}

// معالجة طلبات الـ HTML (لصفحة الأوفلاين)
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
    // عرض صفحة الأوفلاين المخصصة
    const offlinePage = await caches.match('./offline.html');
    return offlinePage || new Response('غير متصل بالإنترنت', { status: 503 });
  }
}

// اعتراض الطلبات
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  
  // تخطي الطلبات المستثناة
  if (isExcluded(url.href)) {
    return;
  }
  
  // طلبات API (Google Scripts)
  if (url.href.includes('script.google.com') || 
      url.href.includes('exec') ||
      url.pathname.includes('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }
  
  // طلبات الصور
  if (request.destination === 'image') {
    event.respondWith(cacheFirst(request));
    return;
  }
  
  // طلبات الـ HTML (صفحات)
  if (request.destination === 'document' || 
      request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(handleHTMLRequest(request));
    return;
  }
  
  // الملفات الثابتة (CSS, JS)
  if (request.destination === 'style' || 
      request.destination === 'script' ||
      request.destination === 'font' ||
      request.destination === 'manifest') {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
  
  // باقي الطلبات: Cache First ثم Network
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
      }).catch(error => {
        console.log('[SW] Fetch failed:', error);
        return new Response('Network error', { status: 503 });
      });
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
      console.log('[SW] Caches cleared successfully');
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ success: true });
      }
    }).catch(err => {
      console.error('[SW] Error clearing caches:', err);
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ success: false, error: err.message });
      }
    });
    return;
  }
  
  if (data?.action === 'getCacheStats') {
    caches.keys().then(async cacheNames => {
      let totalSize = 0;
      for (const cacheName of cacheNames) {
        const cache = await caches.open(cacheName);
        const keys = await cache.keys();
        totalSize += keys.length;
      }
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ cacheCount: cacheNames.length, totalItems: totalSize });
      }
    });
    return;
  }
  
  if (data?.action === 'skipWaiting') {
    self.skipWaiting();
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ success: true });
    }
    return;
  }
});

// مزامنة الخلفية (Background Sync) - للميزات المتقدمة
self.addEventListener('sync', event => {
  console.log('[SW] Background sync event:', event.tag);
  if (event.tag === 'sync-cart') {
    event.waitUntil(syncCartData());
  }
});

async function syncCartData() {
  // يمكن تنفيذ مزامنة بيانات السلة مع الخادم هنا
  console.log('[SW] Syncing cart data...');
  // TODO: إرسال الطلبات المعلقة إلى الخادم
}

// دفع الإشعارات (Push Notifications)
self.addEventListener('push', event => {
  console.log('[SW] Push notification received');
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'توجفن';
  const options = {
    body: data.body || 'تحديث جديد في المتجر',
    icon: data.icon || './favicon.ico',
    badge: './badge.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || './' }
  };
  
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || './';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (let client of windowClients) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
