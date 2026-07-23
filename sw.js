/* Xe Hợp Đồng — service worker
   Đổi PHIEN_BAN mỗi lần deploy để máy khách nhận bản mới. */
const PHIEN_BAN = "xhd-v1.0.0";
const VO = ["./", "./index.html"];   // kho chỉ có 2 file; icon và manifest do trang tự sinh

/* Không bao giờ đụng vào: Firestore, Auth, mã QR ngân hàng */
const BO_QUA = [
  "firestore.googleapis.com", "identitytoolkit.googleapis.com",
  "securetoken.googleapis.com", "firebaseinstallations.googleapis.com",
  "img.vietqr.io"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(PHIEN_BAN).then(c => c.addAll(VO)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== PHIEN_BAN).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET") return;
  const u = new URL(r.url);
  if (BO_QUA.some(d => u.hostname.includes(d))) return;

  /* Trang HTML: ưu tiên mạng để luôn lấy bản mới, rớt mạng thì dùng bản đã lưu */
  if (r.mode === "navigate") {
    e.respondWith(
      fetch(r).then(res => {
        const c = res.clone(); caches.open(PHIEN_BAN).then(k => k.put("./index.html", c)); return res;
      }).catch(() => caches.match("./index.html").then(m => m || caches.match("./")))
    );
    return;
  }

  /* Thư viện Firebase trên CDN + ảnh icon: lấy bản đã lưu trước cho nhanh và chạy được offline */
  e.respondWith(
    caches.match(r).then(m => m || fetch(r).then(res => {
      if (res.ok && (u.hostname === "www.gstatic.com" || u.origin === location.origin)) {
        const c = res.clone(); caches.open(PHIEN_BAN).then(k => k.put(r, c));
      }
      return res;
    }).catch(() => m))
  );
});
