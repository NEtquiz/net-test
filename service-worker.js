// Service Worker for NET Quiz App
const CACHE_NAME = 'net-quiz-cache-v1';

// Files to cache for offline use
const filesToCache = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/manifest.json'
];

// Install event - caches app shell files
self.addEventListener('install', event => {
  console.log('[ServiceWorker] Install');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[ServiceWorker] Caching app shell');
        return cache.addAll(filesToCache);
      })
      .then(() => {
        console.log('[ServiceWorker] Skip waiting on install');
        return self.skipWaiting();
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('[ServiceWorker] Activate');
  
  const cacheWhitelist = [CACHE_NAME];
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('[ServiceWorker] Removing old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[ServiceWorker] Claiming clients');
      return self.clients.claim();
    })
  );
});

// Fetch event - serve from cache if available, otherwise fetch from network
self.addEventListener('fetch', event => {
  console.log('[ServiceWorker] Fetch', event.request.url);
  
  // Skip cross-origin requests
  if (event.request.url.startsWith(self.location.origin)) {
    event.respondWith(
      caches.match(event.request).then(response => {
        if (response) {
          console.log('[ServiceWorker] Found in cache', event.request.url);
          return response;
        }
        
        // Not in cache - fetch from network
        return fetch(event.request)
          .then(response => {
            // Check if we received a valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // Clone the response - one to return, one to cache
            const responseToCache = response.clone();
            
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });
            
            return response;
          })
          .catch(error => {
            console.log('[ServiceWorker] Fetch failed; returning offline page', error);
            
            // If main page is requested but network fails, return cached index
            if (event.request.mode === 'navigate') {
              return caches.match('/index.html');
            }
            
            // If other resources fail, just fail
            return;
          });
      })
    );
  }
});

// Background sync for saving quiz results when offline
self.addEventListener('sync', event => {
  if (event.tag === 'sync-quiz-results') {
    event.waitUntil(syncQuizResults());
  }
});

// Function to sync quiz results when back online
function syncQuizResults() {
  // Get the stored quiz results that need to be synced
  return self.registration.indexedDB.open('netquiz-offline-data')
    .then(db => {
      const tx = db.transaction('offline-results', 'readwrite');
      const store = tx.objectStore('offline-results');
      
      return store.getAll().then(results => {
        return Promise.all(results.map(result => {
          // Try to send each result to the server
          return fetch('/.netlify/functions/save-quiz-result', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(result)
          })
          .then(response => {
            if (response.ok) {
              // If sent successfully, remove from offline store
              return store.delete(result.id);
            }
          });
        }));
      });
    });
}

// Push notification event
self.addEventListener('push', event => {
  console.log('[ServiceWorker] Push received', event);
  
  let title = 'NET Quiz';
  let options = {
    body: 'Time to practice with some quizzes!',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png'
  };
  
  // Try to get data from the push event
  if (event.data) {
    const data = event.data.json();
    title = data.title || title;
    options.body = data.message || options.body;
  }
  
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification click event
self.addEventListener('notificationclick', event => {
  console.log('[ServiceWorker] Notification click received', event);
  
  event.notification.close();
  
  event.waitUntil(
    clients.openWindow('/')
  );
}); 