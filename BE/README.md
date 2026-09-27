# Sports Center Management System - Backend

Welcome to the **Sports Center Management System** backend repository. This backend provides a robust REST API for managing users, memberships, class scheduling, and payments for a multi-platform sports center application (Web & Mobile).

## 🚀 Technologies

This project is built using modern Node.js tools and practices:
- **Runtime:** Node.js
- **Framework:** Express.js (v5)
- **Language:** TypeScript
- **Database:** PostgreSQL
- **ORM:** Prisma
- **Validation:** Zod
- **Authentication:** JWT (JSON Web Tokens) with Access & Refresh tokens
- **API Documentation:** Swagger UI
- **Tooling:** `tsx` for local execution, `helmet` & `cors` for security.

## 📦 Project Structure

```
.
├── prisma/               # Prisma schema and migrations
├── src/
│   ├── config/           # App configuration (Swagger, DB connections, etc.)
│   ├── middlewares/      # Express middlewares (Auth, Error Handler, Zod Validation)
│   ├── modules/          # Feature modules (Controllers, Routes, Services, Schemas)
│   ├── types/            # TypeScript type definitions
│   ├── utils/            # Helper utilities (Bcrypt, JWT, Pagination, Response)
│   ├── app.ts            # Express app setup
│   └── server.ts         # Server entry point
```

### Core Modules (`src/modules/`)
- **`auth/`**: Registration, Login, Token Management, Password changes.
- **`users/` & `members/` & `coaches/`**: User lifecycle and role-specific profiles.
- **`membership-plans/` & `subscriptions/`**: Subscription tiers (FREE, MEMBERSHIP, PREMIUM) and plan management.
- **`sports/` & `rooms/` & `classes/` & `class-schedules/`**: Core catalog and timetabling.
- **`enrollments/`**: Complex booking logic including capacity, tier, and time-conflict checks.
- **`payments/` & `invoices/`**: Payment tracking and automated invoice generation.
- **`reports/`**: Aggregation APIs for analytics (Revenue, Enrollments, Subscriptions).

## 🛠️ Getting Started

### Prerequisites
- Node.js (v18+)
- PostgreSQL Database

### Installation

1. **Clone the repository and install dependencies:**
   ```bash
   npm install
   ```

2. **Environment Variables:**
   Create a `.env` file in the root directory and add the following variables (adjust according to your setup):
   ```env
   PORT=3000
   DATABASE_URL="postgresql://user:password@localhost:5432/sport_center?schema=public"
   JWT_ACCESS_SECRET="your_access_secret"
   JWT_REFRESH_SECRET="your_refresh_secret"
   JWT_ACCESS_EXPIRES_IN="15m"
   JWT_REFRESH_EXPIRES_IN="7d"

   # ── Avatar upload storage (local | Cloudinary) ──
   # Bỏ trống cả 3 biến CLOUDINARY_* => avatar lưu local trong uploads/avatars (dev không cần cloud).
   # Điền đủ 3 biến => avatar tự động đẩy lên Cloudinary (resize 512x512, nén q_auto/f_auto, 1 asset/user).
   # Ghi đè tường minh bằng AVATAR_STORAGE="local" | "cloudinary".
   # Lấy cả 3 giá trị tại Cloudinary Console (console.cloudinary.com) → Settings (bánh răng) → API Keys
   CLOUDINARY_CLOUD_NAME=""            # "Cloud name" — chuỗi chữ thường/số, KHÁC display name trên Console
   CLOUDINARY_API_KEY=""
   CLOUDINARY_API_SECRET=""
   CLOUDINARY_FOLDER="sports-center/avatars"   # thư mục chứa avatar trên Cloudinary
   # Cách nhanh (thay cho 3 biến rời): dán nguyên dòng "API environment variable" trên Console:
   # CLOUDINARY_URL="cloudinary://<api_key>:<api_secret>@<cloud_name>"
   # Ưu tiên: biến rời nào được set thì thắng phần tương ứng trong CLOUDINARY_URL (để trống/không khai báo thì lấy từ URL).

   # ── SePay online payment (chuyển khoản VietQR + webhook) ──
   # Hội viên tự mua gói: BE tạo đơn PENDING + mã thanh toán + ảnh VietQR;
   # SePay gọi webhook khi phát hiện giao dịch ⇒ BE kích hoạt gói + tạo hóa đơn + thông báo.
   SEPAY_WEBHOOK_API_KEY=""            # Phương thức API Key ở bước "Bảo mật" khi tạo webhook trên my.sepay.vn
   SEPAY_WEBHOOK_SECRET=""             # Phương thức HMAC-SHA256 (khuyến nghị) — Secret key ở cùng bước đó
   SEPAY_QR_BASE_URL="https://qr.sepay.vn/img"
   SEPAY_QR_TEMPLATE="compact"         # compact | qronly | standee | (trống = QR chuẩn VietQR)
   SEPAY_CODE_PREFIX="SEVQR"           # khớp "Cấu trúc mã thanh toán" trên my.sepay.vn (tiền tố 2-5 ký tự)
   SEPAY_CODE_SUFFIX_LENGTH="8"        # hậu tố số, SePay khuyến nghị 6-8
   VIETQR_BANK_ID="Sacombank"          # short_name/alias/code/BIN trong banks.json của SePay
   VIETQR_ACCOUNT_NO="0703339186"      # số tài khoản (hoặc VA) nhận tiền
   VIETQR_ACCOUNT_NAME="NGUYEN TRAN TU"
   VIETQR_PAYMENT_TTL_MINUTES="15"
   SEPAY_MOCK_MODE="true"              # BẮT BUỘC false ở production
   # Đối soát chủ động qua SePay API v2 (tùy chọn — dùng khi webhook không tới được BE)
   SEPAY_API_TOKEN=""                  # my.sepay.vn → Cấu hình Công ty → API Access (Test mode có token riêng)
   SEPAY_API_BASE_URL="https://userapi.sepay.vn/v2"   # Test mode: https://userapi-sandbox.sepay.vn/v2
   SEPAY_RECONCILE_MIN_SECONDS="5"     # Khoảng cách tối thiểu giữa 2 lần đối soát cho cùng một đơn
   ```

   *SePay chi tiết:* https://developer.sepay.vn — cấu hình tại my.sepay.vn:
   1. **Cấu hình Công ty → Cấu trúc mã thanh toán**: tiền tố `SEVQR`, hậu tố 6-8 ký tự, Loại ký tự **Số nguyên**
      (khớp `SEPAY_CODE_PREFIX` / `SEPAY_CODE_SUFFIX_LENGTH`). Mã đơn BE sinh có dạng `SEVQR12345678`.
   2. **Webhook**: URL `http://<server>/api/v1/payments/sepay/webhook`, chọn xác thực ở bước Bảo mật:
       **HMAC-SHA256** (khuyến nghị): dán Secret key vào `SEPAY_WEBHOOK_SECRET` — SePay gửi header
       `X-SePay-Signature` + `X-SePay-Timestamp`, BE verify chữ ký trên raw body; hoặc **API Key**:
       dán key vào `SEPAY_WEBHOOK_API_KEY` (SePay gửi `Authorization: Apikey <key>`).
       Bật "Chỉ gửi khi có mã thanh toán: Tiền vào".
   Chạy localhost thì SePay **không gọi được** webhook ⇒ expose BE bằng ngrok, hoặc để `SEPAY_MOCK_MODE=true`
   và xác nhận giao dịch bằng `POST /payments/sepay/mock-confirm` (dev/demo/e2e).
   Giá trị mặc định của từng biến nằm trong `src/config/sepay.ts`.

   **Troubleshooting: đã chuyển khoản mà đơn vẫn `PENDING` (FE cứ "đang chờ ngân hàng xác nhận")**
   `Payment.status` CHỈ đổi khi BE nhận được webhook từ SePay (hoặc `mock-confirm`) — BE không tự dò
   biến động số dư. Chạy BE ở `localhost` thì SePay không gọi được vào máy bạn, nên đơn đứng nguyên
   `PENDING` (log BE chỉ có `GET /payments/sepay/{id}` lặp lại, KHÔNG có `POST /payments/sepay/webhook`).
   Checklist:

   1. Mở tunnel tới cổng BE rồi copy URL HTTPS:
      ```bash
      ngrok http 8080        # hoặc: cloudflared tunnel --url http://localhost:8080
      ```
   2. my.sepay.vn → Webhooks → sửa webhook → URL = `https://<tunnel>/api/v1/payments/sepay/webhook`
      → kiểm tra công tắc **Trạng thái = Bật** (lưu webhook không tự bật lại) → bật "Tự động gửi lại khi server trả lỗi".
   3. Bấm `⋯ → Gửi thử`: kết quả phải là **Thành công** (endpoint trả HTTP 200/201 + `{"success":true}`).
      Báo `Connection Refused` / `DNS Error` / `Timeout` ⇒ tunnel hoặc URL sai (SePay không đi tới localhost được).
   4. Kiểm tra `Webhooks → Lịch sử gửi` (HTTP status, `error_code`, response body) và `Sự cố`.
      SePay chỉ retry **7 lần trong ~33 phút**, sau đó đánh dấu Failed ⇒ nếu webhook đã bị mất, chạy lại
      tunnel rồi vào **Sự cố → Gửi lại** (hoặc `Lịch sử gửi → Phát lại`) để bắn lại đúng giao dịch đó.
   5. Không muốn dùng tiền thật: bật **Test mode** trên my.sepay.vn → tạo tài khoản ngân hàng Test mode với
      **đúng số tài khoản** trong `VIETQR_ACCOUNT_NO` → tạo webhook trỏ về URL tunnel → `Giao dịch → Mô phỏng`
      (số tiền phải khớp CHÍNH XÁC giá gói, nội dung chứa mã đơn `SEVQR…`). Test mode bỏ xác thực SSL nhưng
      vẫn cần URL public.
   6. Không dựng tunnel: `SEPAY_MOCK_MODE=true` (BE) + `VITE_SEPAY_MOCK_MODE=true` (FE) ⇒ trong modal hiện nút
      **"DEV: giả lập SePay đã thu tiền"** (gọi `/payments/sepay/mock-confirm`).
   7. **Không dựng tunnel vẫn muốn tiền thật tự chốt (khuyến nghị cho dev):** đặt `SEPAY_API_TOKEN`
      (my.sepay.vn → Cấu hình Công ty → API Access) ⇒ trong lúc FE polling `GET /payments/sepay/{id}`, BE gọi
      SePay API v2 tìm giao dịch khớp mã đơn ⇒ đơn tự chuyển `SUCCESS` sau ≤ 4 giây, **không cần webhook/ngrok**.
      Test mode dùng token riêng + `SEPAY_API_BASE_URL="https://userapi-sandbox.sepay.vn/v2"`.
      BE chỉ chốt khi khớp CHẶT mã đơn + số tiền + tài khoản nhận, có throttle `SEPAY_RECONCILE_MIN_SECONDS`
      (SePay giới hạn 3 request/giây) và chống chốt trùng bằng advisory lock.

   Khi tiền về nhưng KHÔNG kích hoạt được gói, BE ghi vết để đối soát thủ công và cố ý KHÔNG activate lần hai:
   lệch số tiền / tiền về sau khi đơn đã đóng ⇒ `Payment.note` + notification + `SepayWebhookEvent`
   (`MISMATCH` / `LATE`); đơn đã `SUCCESS` (VD đã chốt bằng mock/đối soát API) mà lại có thêm giao dịch khớp
   tiền ⇒ `SepayWebhookEvent` với `DUPLICATE / PAYMENT_ALREADY_PAID` (cần hoàn tiền nếu là lần chuyển thứ 2).
   Muốn đối soát tay, xem docs SePay → Đối soát giao dịch (`GET https://userapi.sepay.vn/v2/transactions`).

   *Avatar cloud (tùy chọn):* tạo tài khoản tại https://cloudinary.com (free 25GB) → mở Cloudinary Console
   (console.cloudinary.com) → **Settings (bánh răng) → API Keys** → copy `Cloud name`, `API Key`, `API Secret`
   → điền vào `.env` (hoặc Environment trên Render). Kiểm tra nhanh bằng `npm run test:cloudinary:check`.
   Khi đã có đủ credentials, `POST /api/v1/auth/me/avatar` tự động lưu ảnh lên Cloudinary (không cần đổi code);
   để trống thì ảnh vẫn lưu local trong `uploads/avatars/`. Xem `src/config/avatar-storage.ts`.

3. **Database Setup:**
   Run Prisma migrations to set up your PostgreSQL database schema:
   ```bash
   npm run db:migrate
   ```
   *(Optional)* Seed the database with initial data:
   ```bash
   npm run db:seed
   ```

### Running the Application

- **Development Mode:**
  ```bash
  npm run dev
  ```
  The server will start with hot-reloading using `tsx`.

- **Production Build:**
  ```bash
  npm run build
  npm start
  ```

## 📚 API Documentation

Once the server is running, you can view the interactive Swagger API documentation by navigating to:
👉 `http://localhost:<PORT>/api/v1/docs`

## 🗄️ Useful Prisma Scripts

- `npm run db:migrate` - Apply migrations to the database.
- `npm run db:generate` - Generate Prisma Client.
- `npm run db:studio` - Open Prisma Studio to view and edit data visually via browser.
- `npm run db:reset` - Reset the database and re-apply all migrations.

## 🤝 Project Flows (Implemented)
- **Flow 1: User & Membership Management:** Fully functional with tier-based validations.
- **Flow 2: Class Booking & Schedule:** Built with robust logic for conflict handling and capacity limits.
- **Flow 3: Payment & Reports:** End-to-end payment lifecycle and dashboard analytics.

*(Note: AI Workouts, AI Assistant, and advanced Attendance features are planned for future phases).*
