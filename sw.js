/**
 * Solo Leveling PWA - Service Worker
 * نظام التطوير الذاتي - Service Worker للتطبيق
 */

const CACHE_NAME = 'solo-leveling-v1.0.0';
const STATIC_CACHE = 'solo-leveling-static-v1.0.0';
const DYNAMIC_CACHE = 'solo-leveling-dynamic-v1.0.0';

// الملفات التي سيتم تخزينها مؤقتاً بشكل مباشر
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/icon-192.png',
    '/icon-512.png',
    '/index.css',
    '/app.js'
];

// الموارد الخارجية التي يمكن تخزينها مؤقتاً
const EXTERNAL_RESOURCES = [];

/**
 * تثبيت Service Worker
 */
self.addEventListener('install', (event) => {
    console.log('🔧 [SW] جاري تثبيت Service Worker...');
    
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => {
                console.log('📦 [SW] جاري تخزين الملفات الثابتة...');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => {
                console.log('✅ [SW] تم تخزين الملفات الثابتة بنجاح');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('❌ [SW] خطأ في تخزين الملفات:', error);
            })
    );
    
    // تفعيل Service Worker فوراً
    self.addEventListener('activate', (event) => {
        console.log('⚡ [SW] جاري تفعيل Service Worker...');
        event.waitUntil(
            caches.keys()
                .then((cacheNames) => {
                    return Promise.all(
                        cacheNames
                            .filter((cacheName) => {
                                return cacheName.startsWith('solo-leveling-') &&
                                       cacheName !== STATIC_CACHE &&
                                       cacheName !== DYNAMIC_CACHE;
                            })
                            .map((cacheName) => {
                                console.log('🗑️ [SW] جاري حذف الكاش القديم:', cacheName);
                                return caches.delete(cacheName);
                            })
                    );
                })
                .then(() => {
                    console.log('✅ [SW] تم تفعيل Service Worker بنجاح');
                    return self.clients.claim();
                })
        );
    });
});

/**
 * اعتراض طلبات الشبكة
 */
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // تجاهل طلبات chrome-extension و、其他 غير ذات صلة
    if (url.protocol === 'chrome-extension:' ||
        url.protocol === 'moz-extension:' ||
        url.protocol === 'safari-extension:') {
        return;
    }

    // استراتيجية التخزين المؤقت
    const strategy = getCachingStrategy(url);

    switch (strategy) {
        case 'cache-first':
            event.respondWith(cacheFirstStrategy(request));
            break;
        case 'network-first':
            event.respondWith(networkFirstStrategy(request));
            break;
        case 'stale-while-revalidate':
            event.respondWith(staleWhileRevalidate(request));
            break;
        case 'network-only':
            event.respondWith(networkOnly(request));
            break;
        default:
            event.respondWith(cacheFirstStrategy(request));
    }
});

/**
 * تحديد استراتيجية التخزين المناسبة بناءً على نوع الطلب
 */
function getCachingStrategy(url) {
    // طلبات API - استخدام network-first
    if (url.pathname.includes('/api/')) {
        return 'network-first';
    }

    // الملفات الثابتة - استخدام cache-first
    const staticExtensions = ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2'];
    const isStaticFile = staticExtensions.some(ext => url.pathname.endsWith(ext));
    if (isStaticFile) {
        return 'cache-first';
    }

    // طلبات HTML - استخدام stale-while-revalidate
    if (requestIsForHtml(request)) {
        return 'stale-while-revalidate';
    }

    // الافتراضي
    return 'cache-first';
}

/**
 * التحقق مما إذا كان الطلب لملف HTML
 */
function requestIsForHtml(request) {
    const acceptHeader = request.headers.get('accept');
    return acceptHeader && acceptHeader.includes('text/html');
}

/**
 * استراتيجية Cache-First
 * جرب الكاش أولاً، إذا لم يوجد جلب من الشبكة وتخزينه
 */
async function cacheFirstStrategy(request) {
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
        console.log('⚡ [SW] تم تقديم الملف من الكاش:', request.url);
        return cachedResponse;
    }

    try {
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            const cache = await caches.open(STATIC_CACHE);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.error('❌ [SW] خطأ في استراتيجية Cache-First:', error);
        
        // تقديم صفحة offline إذا كانت متوفرة
        const offlinePage = await caches.match('/offline.html');
        if (offlinePage) {
            return offlinePage;
        }
        
        return new Response('لا يوجد اتصال بالإنترنت', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({
                'Content-Type': 'text/plain; charset=utf-8'
            })
        });
    }
}

/**
 * استراتيجية Network-First
 * جرب الشبكة أولاً، إذا فشل استخدم الكاش
 */
async function networkFirstStrategy(request) {
    try {
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            const cache = await caches.open(DYNAMIC_CACHE);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.log('📦 [SW] الشبكة غير متوفرة، جاري استخدام الكاش:', request.url);
        
        const cachedResponse = await caches.match(request);
        
        if (cachedResponse) {
            return cachedResponse;
        }
        
        return new Response(JSON.stringify({
            error: 'لا يوجد اتصال بالإنترنت',
            offline: true
        }), {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({
                'Content-Type': 'application/json'
            })
        });
    }
}

/**
 * استراتيجية Stale-While-Revalidate
 * قدم من الكاش فوراً، ثم حدث الكاش من الشبكة
 */
async function staleWhileRevalidate(request) {
    const cachedResponse = await caches.match(request);
    
    const fetchPromise = fetch(request)
        .then((networkResponse) => {
            if (networkResponse.ok) {
                const cache = caches.open(DYNAMIC_CACHE);
                cache.then(c => c.put(request, networkResponse.clone()));
            }
            return networkResponse;
        })
        .catch((error) => {
            console.log('📦 [SW] تحديث الكاش فشل:', error.message);
            return cachedResponse;
        });

    return cachedResponse || fetchPromise;
}

/**
 * استراتيجية Network-Only
 * استخدم الشبكة فقط، لا تستخدم الكاش
 */
async function networkOnly(request) {
    return fetch(request);
}

/**
 * معالجة رسائل Push Notifications
 */
self.addEventListener('push', (event) => {
    console.log('🔔 [SW] استلام إشعار Push');

    let data = {
        title: 'Solo Leveling',
        body: 'لديك مهمة جديدة!',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        data: {
            url: '/'
        }
    };

    if (event.data) {
        try {
            data = event.data.json();
        } catch (e) {
            data.body = event.data.text();
        }
    }

    const options = {
        body: data.body,
        icon: data.icon || '/icon-192.png',
        badge: data.badge || '/icon-192.png',
        vibrate: [100, 50, 100],
        data: data.data || {},
        actions: [
            { action: 'open', title: 'فتح' },
            { action: 'close', title: 'إغلاق' }
        ],
        requireInteraction: true,
        tag: 'solo-leveling-notification'
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

/**
 * معالجة النقر على الإشعارات
 */
self.addEventListener('notificationclick', (event) => {
    console.log('👆 [SW] تم النقر على الإشعار:', event.action);

    event.notification.close();

    if (event.action === 'close') {
        return;
    }

    const urlToOpen = event.notification.data?.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                // إذا كان هناك نافذة مفتوحة، استخدمها
                for (const client of clientList) {
                    if (client.url === urlToOpen && 'focus' in client) {
                        return client.focus();
                    }
                }

                // إذا لم توجد نافذة مفتوحة، افتح نافذة جديدة
                if (clients.openWindow) {
                    return clients.openWindow(urlToOpen);
                }
            })
    );
});

/**
 * معالجة رسائل من النافذة الرئيسية
 */
self.addEventListener('message', (event) => {
    console.log('📨 [SW] استلام رسالة:', event.data);

    if (event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }

    if (event.data.type === 'CACHE_URLS') {
        event.waitUntil(
            caches.open(STATIC_CACHE)
                .then((cache) => {
                    return cache.addAll(event.data.urls);
                })
                .then(() => {
                    event.ports[0].postMessage({ success: true });
                })
                .catch((error) => {
                    event.ports[0].postMessage({ success: false, error: error.message });
                })
        );
    }

    if (event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.keys()
                .then((cacheNames) => {
                    return Promise.all(
                        cacheNames.map((cacheName) => caches.delete(cacheName))
                    );
                })
                .then(() => {
                    event.ports[0].postMessage({ success: true });
                })
        );
    }
});

/**
 * تزامن البيانات في الخلفية (Background Sync)
 */
self.addEventListener('sync', (event) => {
    console.log('🔄 [SW] تزامن في الخلفية:', event.tag);

    if (event.tag === 'sync-tasks') {
        event.waitUntil(syncTasks());
    }

    if (event.tag === 'sync-habits') {
        event.waitUntil(syncHabits());
    }
});

/**
 * مزامنة المهام
 */
async function syncTasks() {
    console.log('📤 [SW] جاري مزامنة المهام...');
    // يمكن إضافة منطق المزامنة هنا
}

/**
 * مزامنة العادات
 */
async function syncHabits() {
    console.log('📤 [SW] جاري مزامنة العادات...');
    // يمكن إضافة منطق المزامنة هنا
}

/**
 * التنظيف الدوري لل cache
 */
self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'clean-up-cache') {
        event.waitUntil(cleanUpCache());
    }
});

/**
 * حذف الملفات القديمة من cache
 */
async function cleanUpCache() {
    const cacheNames = await caches.keys();
    const cacheLimit = 50 * 1024 * 1024; // 50MB
    
    for (const cacheName of cacheNames) {
        const cache = await caches.open(cacheName);
        const keys = await cache.keys();
        
        let totalSize = 0;
        for (const request of keys) {
            const response = await cache.match(request);
            if (response) {
                const blob = await response.blob();
                totalSize += blob.size;
            }
        }
        
        if (totalSize > cacheLimit) {
            console.log(`🗑️ [SW] حذف الكاش ${cacheName} (${totalSize} bytes)`);
            await caches.delete(cacheName);
        }
    }
}

console.log('🎮 [SW] Solo Leveling Service Worker محمل');
