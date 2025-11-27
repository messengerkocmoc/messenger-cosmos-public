const CACHE_NAME = 'kocmoc-messenger-v2.1.0';
const urlsToCache = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/js/auth.js',
  '/js/chat.js',
  '/js/admin.js',
  '/js/db.js',
  '/js/sync.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  '/manifest.json'
];

// Установка Service Worker
self.addEventListener('install', event => {
  console.log('Service Worker: Установка');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Кэширование файлов');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// Активация Service Worker
self.addEventListener('activate', event => {
  console.log('Service Worker: Активация');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('Service Worker: Удаление старого кэша', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Перехват запросов
self.addEventListener('fetch', event => {
  // Пропускаем API запросы и запросы к файлам
  if (event.request.url.includes('/api/') || event.request.url.includes('/uploads/')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Возвращаем кэшированную версию или делаем запрос
        return response || fetch(event.request);
      })
      .catch(() => {
        // Fallback для оффлайн режима
        if (event.request.destination === 'document') {
          return caches.match('/index.html');
        }
      })
  );
});

// Фоновая синхронизация
self.addEventListener('sync', event => {
  if (event.tag === 'background-sync') {
    console.log('Service Worker: Фоновая синхронизация');
    event.waitUntil(
      syncPendingMessages()
    );
  }
});

// Периодическая синхронизация (для браузеров, которые поддерживают)
self.addEventListener('periodicsync', event => {
  if (event.tag === 'periodic-sync') {
    console.log('Service Worker: Периодическая синхронизация');
    event.waitUntil(
      syncPendingMessages()
    );
  }
});

// Синхронизация ожидающих сообщений
async function syncPendingMessages() {
  try {
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_PENDING_MESSAGES'
      });
    });
  } catch (error) {
    console.error('Service Worker: Ошибка синхронизации', error);
  }
}