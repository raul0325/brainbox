const CACHE_NAME = "brainbox-v8";
const SHELL = ["./", "index.html", "style.css", "app.js", "manifest.json", "light-bg.jpg"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/**
 * ネットが繋がる限りは常に最新を取りに行き、取れたものをキャッシュに保存し直す。
 * オフラインで繋がらない時だけ、保存してあるキャッシュを見せる。
 * これで、開発中にファイルを直しても毎回キャッシュを消す必要がなくなる。
 */
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
