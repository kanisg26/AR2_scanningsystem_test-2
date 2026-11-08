// Service Worker（計画書 §5.1 オフライン撮影）。ビルド時に vite.config.ts が BUILD_ID と PRECACHE を埋め込んで sw.js にする。
// 写真・黒板データは扱わない（アプリのファイルのキャッシュのみ。通信は同じ階層の静的ファイルの取得だけ）。

const BUILD_ID = "20261108T164250Z";
const PRECACHE = ["./","./config.json","./icon.svg","./index.html","./manifest.webmanifest","./assets/index-C4PR00kh.js","./assets/index-CrqIXF6K.css"];

// 同じオリジン（例：kanisg26.github.io）に他のアプリや別の階層の kokuban があっても消し合わないよう、
// キャッシュ名に kokuban とスコープのパスを含め、自分の名前のものだけを扱う
const PREFIX = `kokuban:${new URL(self.registration.scope).pathname}:`;
const CACHE = PREFIX + BUILD_ID;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE.map((path) => new Request(path, { cache: 'reload' })))),
  );
  // 新しい版は、利用者が「再読み込み」を押すまで待機する（撮影の途中で入れ替わらないように）
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || !request.url.startsWith(self.registration.scope)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      // config.json は置いた先で書き換えるものなので、通信できるときは最新を使う
      if (new URL(request.url).pathname.endsWith('/config.json')) {
        try {
          return await fetch(request);
        } catch {
          return (await cache.match(request)) ?? Response.error();
        }
      }
      const hit = await cache.match(request, { ignoreSearch: request.mode === 'navigate' });
      if (hit) return hit;
      if (request.mode === 'navigate') {
        const index = await cache.match('./index.html');
        if (index) return index;
      }
      return fetch(request);
    })(),
  );
});
