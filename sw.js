const CACHE_NAME = "gec-attendance-v3";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css", 
  "./script.js", 
  "./manifest.json",
  "./image/logo.png",
  "./image/logo-192.png",
  "./image/logo-512.png",
  "https://cdn.tailwindcss.com",
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css",
];

// 1. INSTALL: Save the assets to the phone's memory
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }),
  );
  self.skipWaiting();
});

// 2. ACTIVATE: Delete old caches from previous versions
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      );
    }),
  );
});

// 3. FETCH: Handle internet requests
self.addEventListener("fetch", (event) => {
  // For Google Scripts (Live Data), always go to Network
  if (event.request.url.includes("script.google.com")) {
    return; // Don't cache live attendance submissions
  }

  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    }),
  );
});
