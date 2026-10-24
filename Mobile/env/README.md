# Cấu hình môi trường cho Mobile

Flutter không đọc file `.env` lúc chạy — biến được gắn vào app lúc build bằng `--dart-define`
(đọc trong `lib/core/config/env.dart`). Các file JSON ở đây gom biến lại cho tiện:

| File | Dùng khi |
|---|---|
| `local.json` | Android emulator + BE local (`npm run dev:local`, cổng 8081). `10.0.2.2` = localhost của máy tính |
| `mock.json` | Chỉ xem giao diện bằng dữ liệu giả lập, không cần BE |
| `device.example.json` | Điện thoại thật cùng Wi‑Fi — sửa IP thành IP máy tính (`ipconfig`) |

Chạy: `flutter run --dart-define-from-file=env/local.json`
Android Studio: Run → Edit Configurations… → **Additional run args**: `--dart-define-from-file=env/local.json`

Biến hỗ trợ: `APP_ENV` (dev|staging|prod), `USE_MOCK` (true|false), `API_BASE_URL`,
`MOCK_FEATURES` (VD `chat,training`), `API_BASE_URL_STAGING`, `API_BASE_URL_PROD`.
Không đặt bí mật (mật khẩu, khóa API) vào đây — giá trị bị đóng gói vào file APK.
