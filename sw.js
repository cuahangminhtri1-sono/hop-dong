/* ==================================================================
   sw.js — bộ nhớ đệm ngoại tuyến cho app HTML một tệp  (admin + HD)
   Đặt NGANG HÀNG với index.html trong từng kho (repo).

   >>> ĐÃ SỬA LỖI NGHIÊM TRỌNG <<<
   Bản cũ đặt tên cache cố định "vo-v1"/"ngoai-v1" (không gắn theo app) và ở
   activate lại xoá MỌI cache khác hai tên đó. Vì 6 app chung origin github.io,
   nên mỗi lần mở admin/HD là nó XOÁ SẠCH cache offline của Sổ Nợ/TrọSafe/Cafe/Xe,
   khiến các app kia mất offline cho tới khi mở lại online.
   -> Nay tên cache gắn theo scope (mỗi app 1 bộ riêng) và chỉ xoá cache CÙNG app.

   Mỗi lần deploy bản mới: đổi số ở PHIENBAN (v1 → v2 → v3…).
   Lần này: v2 -> v3 để đẩy bản vá BỘ THU LỖI (lọc nhiễu zaloJSV2 …) —
   đổi PHIENBAN thì máy khách mới nạp Service Worker mới và tải index.html mới.
   ================================================================== */
const PHIENBAN  = "v3";                              // đã tăng v2 -> v3 để đẩy bản vá
const SCOPE     = self.registration.scope;           // ⬅️ mỗi app 1 bộ cache riêng
const KHO_VO    = "vo-"    + PHIENBAN + "-" + SCOPE;  // khung app cùng tên miền
const KHO_NGOAI = "ngoai-" + PHIENBAN + "-" + SCOPE;  // thư viện ngoài (đã gắn số phiên bản)

/* ⚠️ Precache CẢ HAI phiên bản để 1 file này chép chung được cho CẢ admin lẫn HD.
   Trước đây chỉ có 10.12.5 nên SAI cho admin (admin đã lên 12.17.1):
     - admin (index.html) import Firebase 12.17.1  (kèm firebase-functions)
     - HD    (index.html) import Firebase 10.12.5
   App nào không dùng phiên bản nào thì chỉ THỪA vài file trong cache (vô hại);
   quan trọng là phiên bản ĐÚNG của mỗi app luôn có sẵn -> không màn hình trắng. */
const NGOAI = [
  "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js",
  "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js",
  "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js",
  "https://www.gstatic.com/firebasejs/12.17.1/firebase-functions.js",
  "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js",
  "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js",
  "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js"
];

/* Địa chỉ để Firebase tự lo — đệm lại là hỏng đồng bộ và hỏng đăng nhập. */
const BO_QUA = [
  "firestore.googleapis.com", "identitytoolkit.googleapis.com",
  "securetoken.googleapis.com", "firebaseinstallations.googleapis.com",
  "firebaselogging-pa.googleapis.com", "google-analytics.com", "img.vietqr.io"
];

const HET_GIO = (p, ms) => Promise.race([
  p, new Promise((_, x) => setTimeout(() => x(new Error("het gio")), ms))
]);

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const vo = await caches.open(KHO_VO);
    // Nạp từng cái một: một tệp hỏng thì các tệp còn lại vẫn vào được kho.
    await Promise.all(["./", "./index.html"].map(u => vo.add(u).catch(() => {})));
    const ng = await caches.open(KHO_NGOAI);
    await Promise.all(NGOAI.map(u => ng.add(u).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const ten  = await caches.keys();
    const duoi = "-" + SCOPE;   // ⬅️ CHỈ xoá cache CÙNG app này (cùng scope), bản phiên bản cũ
    await Promise.all(ten.map(k =>
      (k.slice(-duoi.length) === duoi && k !== KHO_VO && k !== KHO_NGOAI)
        ? caches.delete(k) : null));
    await self.clients.claim();
  })());
});

self.addEventListener("message", e => { if (e.data === "capNhat") self.skipWaiting(); });

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;

  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return;
  if (BO_QUA.some(d => url.hostname.endsWith(d))) return;

  /* 1. Mở trang: ưu tiên bản mới trên mạng, chờ tối đa 4 giây rồi lấy bản đã lưu.
        Nhờ vậy vừa cập nhật được bản mới, vừa mở được khi rớt mạng. */
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      const vo = await caches.open(KHO_VO);
      try {
        const res = await HET_GIO(fetch(req), 4000);
        if (res && res.ok) {
          vo.put(req, res.clone());
          /* Khoá dự phòng "./index.html" chỉ dành cho trang gốc, tránh ghi bừa. */
          const goc = url.pathname === new URL("./", self.location).pathname ||
                      url.pathname === new URL("./index.html", self.location).pathname;
          if (goc) vo.put("./index.html", res.clone());
        }
        return res;
      } catch (err) {
        return (await vo.match(req)) || (await vo.match("./index.html")) ||
               (await vo.match("./"))  || new Response(
                 "<meta charset=utf-8><body style='font:16px system-ui;padding:28px'>Chưa có bản lưu trên máy. Nối mạng và mở lại một lần.",
                 { headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
    })());
    return;
  }

  /* 2. Thư viện ngoài: đường dẫn đã gắn số phiên bản nên không bao giờ đổi ruột
        → lấy thẳng bản đã lưu, nhanh và chắc chắn chạy được khi mất mạng. */
  if (url.origin !== self.location.origin) {
    e.respondWith((async () => {
      const ng = await caches.open(KHO_NGOAI);
      const co = await ng.match(req);
      if (co) return co;
      try {
        const res = await fetch(req);
        if (res && (res.ok || res.type === "opaque")) ng.put(req, res.clone());
        return res;
      } catch (err) {
        return new Response("", { status: 504, statusText: "Ngoai tuyen" });
      }
    })());
    return;
  }

  /* 3. Tệp cùng tên miền: trả bản đã lưu ngay, đồng thời làm mới ngầm cho lần sau. */
  e.respondWith((async () => {
    const vo  = await caches.open(KHO_VO);
    const co  = await vo.match(req);
    const moi = fetch(req).then(res => { if (res && res.ok) vo.put(req, res.clone()); return res; })
                          .catch(() => null);
    return co || (await moi) || new Response("", { status: 504, statusText: "Ngoai tuyen" });
  })());
});
