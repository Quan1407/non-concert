# Đưa NÓN CONCERT lên mạng (GitHub + Render)

**Có tài khoản GitHub là đủ bước đầu.** Bạn đẩy code lên GitHub, rồi Render (miễn phí) kéo code từ GitHub và chạy server — bạn sẽ có link `https://....onrender.com` gửi cho mọi người.

## Bước 1: Đẩy code lên GitHub

1. Tạo repo mới trên GitHub (ví dụ `non-concert`), **không** cần README có sẵn.
2. Trên máy (trong thư mục project):

```bash
cd d:\NónConcert
git init
git add .
git commit -m "NÓN CONCERT — deploy"
git branch -M main
git remote add origin https://github.com/<TÊN_USER>/<TÊN_REPO>.git
git push -u origin main
```

(Thay URL bằng repo của bạn.)

## Bước 2: Tạo Web Service trên Render

1. Vào [render.com](https://render.com) → đăng nhập → **New +** → **Web Service**.
2. **Connect** repository GitHub vừa tạo → chọn repo.
3. Cấu hình:
   - **Name:** tùy bạn (ví dụ `non-concert`).
   - **Region:** Singapore / gần VN nếu có.
   - **Branch:** `main`.
   - **Root Directory:** `server`  ← quan trọng.
   - **Runtime:** Node.
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. Chọn plan **Free** (lần đầu cold start có thể chậm vài chục giây).

## Bước 3: Biến môi trường (Environment)

Trong Render → **Environment** của service, thêm (ít nhất):

| Key | Giá trị gợi ý |
|-----|----------------|
| `NODE_ENV` | `production` |
| `ADMIN_USERNAME` | `admin` (hoặc đổi) |
| `ADMIN_PASSWORD` | mật khẩu mạnh, **bạn tự đặt** |
| `SESSION_SECRET` | chuỗi ngẫu nhiên dài 32+ ký tự |

Có thể thêm các biến khác như trong `server/.env.example` (`CONCERT_DATE`, `MAX_TICKETS`, SMTP…).

**Lưu ý:** `FRONTEND_URL` để **trống** hoặc không thêm — trang web và API cùng một domain Render → không lỗi CORS/cookie.

## Bước 4: Deploy và lấy link

1. Bấm **Create Web Service** → chờ build xong.
2. Link dạng: `https://<tên-service>.onrender.com`
3. Gửi link đó cho người khác:
   - Trang chủ: `https://...onrender.com/`
   - Admin: `https://...onrender.com/admin-login.html`

## SQLite trên Render Free

Dữ liệu vé nằm trong `server/data/` trên ổ của Render — **có thể mất khi redeploy / sleep lâu**. Demo được; production thật nên dùng **Persistent Disk** gắn vào `server/data` hoặc chuyển PostgreSQL (xem `README.md`).

## File `render.yaml`

Ở root repo có `render.yaml` — nếu dùng **Blueprint** trên Render, một phần cấu hình sẽ tự điền; biến bí mật (`ADMIN_PASSWORD`, `SESSION_SECRET`) vẫn phải thêm tay trong dashboard.
