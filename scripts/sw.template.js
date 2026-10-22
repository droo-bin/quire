// Quire service worker: keeps every file of the app on this device so it opens and works offline,
// and marks the page cross-origin isolated so the optional language model can use several processor cores.
// Each file is stored under its own content hash, so an update only downloads the files that changed.
const VERSION = '%%VERSION%%';
const FILES = %%FILES%%; // [[path, hash], ...]
const CACHE = 'quire-' + VERSION;
const ISOLATION = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'credentialless' };
const scope = () => self.registration.scope;
const HASH = new Map(FILES.map(([p, h]) => [new URL(p, self.location).href, h]));
const keyFor = (url, hash) => url + (url.includes('?') ? '&' : '?') + 'v=' + hash;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(FILES.map(async ([path, hash]) => {
      const url = new URL(path, self.location).href;
      const key = keyFor(url, hash);
      const old = await caches.match(key); // unchanged since an earlier version: reuse it
      if (old) return cache.put(key, old);
      const res = await fetch(new Request(url, { cache: 'reload' }));
      if (!res.ok) throw new Error(`Couldn't fetch ${path}: ${res.status}`);
      return cache.put(key, res);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('quire-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

function isolate(response) {
  if (!response || response.status === 0 || response.type === 'opaque') return response;
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(ISOLATION)) headers.set(k, v);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // model downloads go straight to the network
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const page = req.mode === 'navigate' ? new URL('./', scope()).href : url.origin + url.pathname;
    const hash = HASH.get(page);
    let hit = hash ? await cache.match(keyFor(page, hash)) : null;
    if (!hit) {
      try { hit = await fetch(req); }
      catch (e) { const home = new URL('./', scope()).href; hit = await cache.match(keyFor(home, HASH.get(home))); }
    }
    return isolate(hit);
  })());
});
