/* Service worker dùng chung cho cả kho app lẫn kho admin.
   Cố ý KHÔNG khai sẵn tên file nào: kho này để index.html, kho kia để
   admin.html — khai cứng mà sai tên là service worker cài hỏng và điện
   thoại sẽ không cho cài app vào màn hình chính.
   Đổi PHIEN_BAN mỗi lần deploy để máy khách nhận bản mới. */
const PHIEN_BAN = "v1.0.1";
const KHO = "cache-" + PHIEN_BAN;

/* Không bao giờ đụng vào: Firestore, Auth, mã QR ngân hàng */
const BO_QUA = [
  "firestore.googleapis.com", "identitytoolkit.googleapis.com",
  "securetoken.googleapis.com", "firebaseinstallations.googleapis.com",
  "img.vietqr.io"
];

self.addEventListener("install", e => self.skipWaiting());

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== KHO).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET") return;
  const u = new URL(r.url);
  if (BO_QUA.some(d => u.hostname.includes(d))) return;

  /* Trang HTML: ưu tiên mạng để luôn lấy bản mới; rớt mạng thì mở bản đã lưu.
     Lần mở đầu tiên là trang tự được lưu lại, nhờ đó offline vẫn vào được và
     trình duyệt mới cho phép cài vào màn hình chính. */
  if (r.mode === "navigate") {
    e.respondWith(
      fetch(r)
        .then(res => { const c = res.clone(); caches.open(KHO).then(k => k.put(r, c)); return res; })
        .catch(() => caches.match(r, {ignoreSearch:true})
          .then(m => m || caches.match(new Request(u.pathname))
          .then(m2 => m2 || new Response(
            "<meta charset='utf-8'><body style='background:#12151a;color:#e9ecf1;font-family:system-ui;padding:40px;text-align:center'>Chưa có mạng và máy chưa lưu bản nào. Mở lại khi có mạng giúp mình.</body>",
            {headers:{"Content-Type":"text/html; charset=utf-8"}}))))
    );
    return;
  }

  /* Thư viện Firebase trên CDN và file trong kho: lấy bản đã lưu trước cho
     nhanh, chưa có thì tải rồi lưu lại. */
  e.respondWith(
    caches.match(r).then(m => m || fetch(r).then(res => {
      if (res.ok && (u.hostname === "www.gstatic.com" || u.origin === location.origin)) {
        const c = res.clone(); caches.open(KHO).then(k => k.put(r, c));
      }
      return res;
    }).catch(() => m))
  );
});
