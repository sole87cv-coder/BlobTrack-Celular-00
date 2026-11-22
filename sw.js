const CACHE_PREFIX = 'blobtrack-celular-00-';
const CACHE = 'blobtrack-celular-00-v28';
const SHELL = [
  './index.html', './teste.html', './manifest.webmanifest', './src/app.css', './src/app.js',
  './src/blob-tracker.js', './src/domain/blobTrackerCore.js', './src/video-crop.js', './src/audio-processor.js', './src/recorder.js',
  './src/recording-canvas.js', './src/recording-export.js', './src/preferences.js',
  './src/audio/audio.js', './src/core/deviceProfile.js', './src/core/utils.js',
  './src/render/render.js', './src/session/sessionLock.js', './src/platform/wakeLock.js', './teste.css',
  './teste.js', './icons/icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys
      .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE)
      .map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;

  const cachePromise = caches.open(CACHE);
  let cacheWrite = Promise.resolve();
  const responsePromise = (async () => {
    const cache = await cachePromise;
    const cached = await cache.match(event.request);
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok) cacheWrite = cache.put(event.request, response.clone());
    return response;
  })();

  event.respondWith(responsePromise.catch(async error => {
    if (event.request.mode !== 'navigate') throw error;
    const cache = await cachePromise;
    const fallback = await cache.match('./index.html');
    if (fallback) return fallback;
    throw error;
  }));
  event.waitUntil(responsePromise.then(() => cacheWrite).catch(() => {}));
});