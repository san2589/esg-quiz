/* ESG Quiz - Stable Service Worker (Production)
 * - App shell precache (index.html, manifest, icons)
 * - questions.json: network-first (always try latest), fallback to cache
 * - Version bump => auto clear old caches
 */

const CACHE_VERSION = "v1.0.1"; // ← 每次上線更新時，改這個版本號
const APP_SHELL_CACHE = `esg-appshell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `esg-runtime-${CACHE_VERSION}`;

// 你 repo 主要檔案（可依需要增減）
const APP_SHELL_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon.png",
  "./questions.json",
  // 若你有 icons 資料夾，至少放常用幾個
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

// 安裝：預快取 App shell
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_SHELL_CACHE);
    // 避免某些檔案不存在造成整包失敗：逐一 try
    for (const url of APP_SHELL_ASSETS) {
      try { await cache.add(url); } catch (e) {}
    }
    self.skipWaiting();
  })());
});

// 啟用：清掉舊版本快取
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => k.startsWith("esg-") && !k.includes(CACHE_VERSION))
        .map(k => caches.delete(k))
    );
    self.clients.claim();
  })());
});

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    // 盡量拿最新
    const fresh = await fetch(request, { cache: "no-store" });
    if (fresh && fresh.ok) {
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch (e) {
    // 離線或失敗時回退快取
    const cached = await cache.match(request);
    if (cached) return cached;
    throw e;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(APP_SHELL_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const res = await fetch(request);
  // 成功才寫入
  if (res && res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // 只處理同源（GitHub Pages 站內）
  if (url.origin !== self.location.origin) return;

  // questions.json：永遠優先抓最新（network-first）
  if (url.pathname.endsWith("/questions.json") || url.pathname.endsWith("questions.json")) {
    event.respondWith(networkFirst(req));
    return;
  }

  // HTML：網路優先，離線回退快取（避免卡舊 index）
  if (req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(networkFirst(req));
    return;
  }

  // 其他靜態資源：cache-first（icon、manifest、css、js）
  event.respondWith(cacheFirst(req));
});
