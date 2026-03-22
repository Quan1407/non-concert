# NÓN CONCERT — hệ thống đặt vé (demo production)

Frontend tĩnh (HTML/CSS/JS) + API **Node.js + Express** + **SQLite**.

**Lưu trữ:** Mỗi lần đặt vé, hệ thống ghi vào bảng `tickets`: họ tên, SĐT, email, mã vé, giá, trạng thái thanh toán, check-in… Cùng một email/SĐT có thể đặt **nhiều lần** (mỗi lần là một `purchase_ref` mới); mỗi lần chọn tối đa 10 vé, tổng số vé vẫn không vượt `MAX_TICKETS`.

**Luồng thanh toán:** Đặt vé → trạng thái **chờ chuyển khoản** (`pending`) → khách quét VietQR → admin vào **/admin** bấm **Xác nhận đã CK** → trạng thái **đã thanh toán** (`paid`) → lúc đó **check-in** tại cổng mới thành công. Doanh thu trên dashboard chỉ tính vé đã `paid`.

## Chạy nhanh (một server — khuyên dùng khi dev / deploy full trên Render)

```bash
cd server
cp .env.example .env
npm install
npm start
```

Mở **http://localhost:3000** (API + giao diện trong thư mục `public/`).

## Đưa lên mạng cho người khác bấm link

Cần **GitHub** + dịch vụ host (khuyên dùng **Render**, miễn phí): đẩy code lên repo → kết nối Render → có URL `https://....onrender.com`. Chi tiết từng bước: **[DEPLOY.md](./DEPLOY.md)**.

## Biến môi trường (`server/.env`)

| Biến | Ý nghĩa |
|------|---------|
| `PORT` | Cổng HTTP |
| `FRONTEND_URL` | Danh sách origin CORS (cách nhau bằng dấu phẩy). Để trống = cho phép mọi origin (reflect) |
| `CONCERT_DATE` | ISO 8601 — đếm ngược trên trang chủ |
| `TICKET_PRICE_VND` | Giá một vé |
| `MAX_TICKETS` | Tối đa **200** vé (mặc định) |
| `SMTP_*`, `EMAIL_FROM` | Gửi email sau khi mua |
| `SKIP_EMAIL=true` | Bỏ qua gửi mail (dev) |
| `ADMIN_USERNAME` | Tài khoản đăng nhập admin (mặc định `admin`) |
| `ADMIN_PASSWORD` | **Bắt buộc** — mật khẩu admin |
| `SESSION_SECRET` | Chuỗi ký cookie session (đổi trên production) |

Trang **`/admin.html`** chỉ mở được khi đã đăng nhập; vào **`/admin-login.html`** để đăng nhập. API `/api/admin/*` (trừ `login`, `logout`, `me`) cần cookie session.

**Lưu ý deploy:** Cookie đăng nhập gắn với **domain API**. Nếu tách Vercel + Render, mở admin qua **URL của Render** (cùng origin với API), hoặc dùng proxy; nếu không, trình duyệt sẽ không gửi được session.

## API

- `GET /api/health` — kiểm tra service (Render)
- `GET /api/config` — ngày giờ show, giá, còn bao nhiêu vé
- `POST /api/purchase` — `{ name, phone, email, quantity }`
- `POST /api/checkin` — `{ ticket_code }` → thành công nếu đã `paid`; hoặc `Invalid ticket` / `Already used` / `Chưa thanh toán`
- `GET /api/admin/stats` — vé đã giữ, doanh thu (đã CK), số đơn & tổng tiền chờ xác nhận CK, check-in
- `GET /api/admin/me` — `{ ok: boolean }` (không cần đăng nhập)
- `POST /api/admin/login` — `{ username, password }`
- `POST /api/admin/logout`
- `GET /api/admin/tickets?...` — cần đăng nhập
- `POST /api/admin/mark-paid` — cần đăng nhập — `{ "purchase_ref": "<uuid>" }`
- `POST /api/admin/reset-tickets` — cần đăng nhập — `{ "confirm": "yes" }` — xóa **toàn bộ** vé trong SQLite (về 0). Tắt bằng `ADMIN_ALLOW_RESET=false`

## Tách deploy: Vercel (frontend) + Render (backend)

1. **Render**: Web Service, root `server`, lệnh `npm start`, thêm biến môi trường; URL ví dụ `https://non-api.onrender.com`.
2. Trong **mỗi file HTML** của `public/` (hoặc một file `public/js/config-snippet.js`), đặt trước các script:

   ```html
   <script>window.__API_BASE__ = 'https://non-api.onrender.com';</script>
   ```

3. **Vercel**: import project, **Root Directory** = `public` (chỉ deploy static). Trong `vercel.json` ở root repo, sửa `destination` rewrite `/api/*` trỏ tới URL Render (nếu muốn gọi API cùng origin thay vì `__API_BASE__`).

File `render.yaml` mẫu nằm ở root repo.

## Ghi chú bảo mật

Đặt **`ADMIN_PASSWORD`** và **`SESSION_SECRET`** mạnh trên production; HTTPS (Render) bật cookie `secure`. Trang admin vẫn nên hạn chế IP / VPN nếu cần.

## CSDL

SQLite tại `server/data/nonconcert.db` (tự tạo). Mỗi vé = một dòng; cùng một lần mua có chung `purchase_ref`.

Trên **Render free**, ổ đĩa có thể bị xoá khi redeploy — với production hãy gắn **Persistent Disk** trỏ vào `server/data` hoặc chuyển sang PostgreSQL.
