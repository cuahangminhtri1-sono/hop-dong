/* ==================================================================
   sw.js — bộ nhớ đệm ngoại tuyến cho app HTML một tệp
   Đặt NGANG HÀNG với index.html trong từng kho (repo).

   Mỗi lần deploy bản mới: đổi số ở PHIENBAN (v1 → v2 → v3…).
   Không đổi thì máy khách vẫn chạy khung app cũ đã lưu.
   ================================================================== */
const PHIENBAN  = "v1";
const KHO_VO    = "vo-"    + PHIENBAN;   // khung app: HTML, ảnh, tệp cùng tên miền
const KHO_NGOAI = "ngoai-" + PHIENBAN;   // thư viện ngoài: đường dẫn đã có số phiên bản

/* ⚠️ SỐ PHIÊN BẢN PHẢI KHỚP TỪNG CHỮ với dòng import trong index.html.
   Sổ Nợ dùng 10.12.0, hai app này dùng 10.12.5 — chép nhầm là mất mạng
   app đứng im ở màn hình trắng vì không nạp được thư viện. */
const NGOAI = [
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
    const ten = await caches.keys();
    await Promise.all(ten.filter(k => k !== KHO_VO && k !== KHO_NGOAI).map(k => caches.delete(k)));
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
        if (res && res.ok) { vo.put("./index.html", res.clone()); vo.put(req, res.clone()); }
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
