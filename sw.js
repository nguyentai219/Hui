/* ============================================
   SERVICE WORKER - Quản Lý Hụi
   Cho phép dùng offline sau lần đầu tải
   ============================================ */

const CACHE_NAME = "quan-ly-hui-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/app.js",
  "./js/drive.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "https://cdn.tailwindcss.com",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

// Chỉ xoá cache CŨ CỦA APP NÀY (tiền tố riêng) — bộ nhớ cache dùng chung cả tên miền
// nguyentai219.github.io, xoá hết sẽ làm mất bản offline của các app khác (Mủ Cao Su, Quản Lý Heo...).
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => (k.startsWith('quan-ly-hui-')) && k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  // Google APIs luôn fetch từ network
  if (e.request.url.includes("googleapis.com") || e.request.url.includes("accounts.google.com")) {
    return;
  }
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).catch(() => cached))
  );
});
