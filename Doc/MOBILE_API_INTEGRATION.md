# 🔌 Nối API thật cho Mobile (Flutter)

> **Ngày cập nhật:** 10/10/2026 (đợt 2 — BE đã bổ sung API, xem [`BE_API_CHANGES.md`](BE_API_CHANGES.md)) · **Nhánh:** `develop` (HEAD `22447bb`) · không commit/push, không đụng `FE/`.
> **Kết quả:** 14/14 repository gọi API thật; **mặc định `USE_MOCK=false`** (mock vẫn bật được bằng `--dart-define=USE_MOCK=true`, hoặc từng chức năng bằng `MOCK_FEATURES`). Không còn phần ước tính phía Mobile; không còn `TODO(API)` mở.
> **Kiểm thử:** `flutter analyze` 0 issue · `flutter test` **98 pass** (+4 test "live" bỏ qua mặc định) · `flutter build apk --debug` **thành công** · test live của các repository Mobile với BE thật (PostgreSQL local) **4/4** · smoke test end-to-end BE **37/37**.
> Lịch sử: đợt 1 (chỉ Mobile) ghi nhận 22 API thiếu (BE-1…BE-22) và 14 điểm lệch (L1…L14) — **tất cả đã xử lý** ở đợt 2.
> **Đợt 3 (11/10/2026) — Cửa hàng:** giỏ hàng, checkout (nhận tại trung tâm / giao hàng, bắt buộc trả trước VietQR), sổ địa chỉ, đơn hàng theo máy trạng thái, mã nhận hàng, xử lý đơn / quét mã / tồn kho cho Manager. Thiết kế: [`SHOP_FLOW_DESIGN.md`](SHOP_FLOW_DESIGN.md). Kiểm thử đợt 3: `flutter analyze` 0 issue · `flutter test` **108 pass** · build APK debug OK · test live **5/5** (thêm luồng giỏ → đặt hàng → hủy với BE thật).

---

## Mục lục

1. [Khảo sát (đợt 1)](#1-khảo-sát-đợt-1)
2. [Nền tảng kết nối](#2-nền-tảng-kết-nối)
3. [Bảng mapping chức năng ↔ API](#3-bảng-mapping-chức-năng--api)
4. [✅ Đã nối hoàn chỉnh](#4--đã-nối-hoàn-chỉnh)
5. [⚠️ Còn hạn chế](#5-️-còn-hạn-chế)
6. [❌ API còn thiếu](#6--api-còn-thiếu)
7. [🔀 Điểm lệch — quyết định đã áp dụng](#7--điểm-lệch--quyết-định-đã-áp-dụng)
8. [File đã thêm/sửa, package](#8-file-đã-thêmsửa-package)
9. [Cấu hình & chạy thử](#9-cấu-hình--chạy-thử)

---

## 1. Khảo sát (đợt 1)

- **Mobile:** feature-first; mỗi feature có `domain/repositories/<x>_repository.dart` (interface) + `data/<x>_mock_repository.dart` + `data/<x>_repository_provider.dart`; Riverpod 3; lỗi thống nhất `AppFailure`; không dùng freezed (parse tay qua `lib/core/network/json.dart`, mapper dùng chung ở `lib/api/*_json.dart`).
- **BE:** Express 5 + Prisma + Zod, prefix `/api/v1`, envelope `{ success, message, data, pagination? }`; lỗi `errors` là mảng `[{field,message}]` (Zod) hoặc object `{ code, ... }`. JWT access 15 phút / refresh 7 ngày (lưu hash; refresh không xoay vòng; nay có `jti`). Socket.IO cho chat + (mới) `notification:new`.
- **Tài khoản seed:** `manager@sportscenter.com` / `Manager@123` · `coach1@sportscenter.com`, `coach2@…` / `Coach@123` · `member1..3@example.com`, `sepay.test@example.com` / `Member@123`.

## 2. Nền tảng kết nối

| Thành phần | File | Ghi chú |
|---|---|---|
| Môi trường | `lib/core/config/env.dart` | `APP_ENV=dev\|staging\|prod`, `API_BASE_URL` ghi đè; dev: Android emulator `http://10.0.2.2:8080`, iOS/desktop `http://localhost:8080`. **`USE_MOCK` mặc định `false`**; `MOCK_FEATURES=a,b` ép chức năng chạy mock. Test widget ép mock qua `test/flutter_test_config.dart` (`Env.debugUseMockOverride`) |
| HTTP | `lib/core/network/api_client.dart` | Dio: envelope, `getAll` (mọi trang), `upload` multipart (đúng MIME), `getBytes` (ảnh VietQR / file có xác thực), log debug không lộ token/mật khẩu |
| Token | `lib/core/network/token_storage.dart` | `flutter_secure_storage`; `userId` đọc từ payload JWT |
| Refresh / hết phiên | `lib/core/network/auth_interceptor.dart` | Refresh 1 lần cho mọi request song song; thất bại ⇒ xóa token + về màn Đăng nhập; mất mạng ⇒ giữ phiên |
| Lỗi | `lib/core/network/api_error_mapper.dart` | Tiếng Việt; lỗi Zod ⇒ lỗi theo field; `errors.code` ⇒ `AppFailure.code`; phần còn lại ⇒ `AppFailure.details` |
| **Realtime** (mới) | `lib/core/network/realtime_client.dart` | `socket_io_client`: token mới ở mỗi lần (kết nối lại), tự nối lại (backoff), bị từ chối vì token hết hạn ⇒ gọi 1 request REST nhẹ để interceptor refresh rồi nối lại; đóng khi đăng xuất/hết phiên. `connected` để bật polling dự phòng |
| Splash | `splash_screen.dart`, `app_router.dart` | Mất mạng khi khôi phục phiên ⇒ "Thử lại" |
| Nền tảng | `AndroidManifest.xml` (debug), `Info.plist` | HTTP local cho bản debug |

## 3. Bảng mapping chức năng ↔ API

Trạng thái: **Có** = BE có, khớp. Cột cuối: tình trạng Mobile.

### 3.1. Xác thực & hồ sơ

| Chức năng | Màn hình | Endpoint BE | Trạng thái | Ghi chú |
|---|---|---|---|---|
| Đăng nhập (+ phiên giới hạn HLV chưa duyệt) | A03 | `POST /auth/login` → `GET /auth/me` | Có | ✅ BE-9: HLV chưa duyệt đăng nhập với `restricted:true` ⇒ router vào màn nộp CV / trạng thái hồ sơ |
| Đăng ký | A04 | `POST /auth/register` | Có | ✅ Coach nhận cả refresh token |
| Nộp CV / trạng thái hồ sơ | O01, O02 | `POST /coaches/me/cv`, `GET /auth/me` | Có | ✅ Tải lại trạng thái được (BE-9); BE trả `certification` vừa lưu |
| Khôi phục phiên, refresh, đăng xuất | A01, — | `GET /auth/me`, `POST /auth/refresh-token`, `POST /auth/logout` | Có | ✅ |
| Quên mật khẩu (OTP) | A05 → A06 | `POST /auth/forgot-password`, `PATCH /auth/reset-password {email, otp, newPassword}` | Có | ✅ A06 nhập OTP 6 số + mật khẩu mới, **đếm ngược 60s** trước khi "Gửi lại mã"; mã sai/hết hạn/quá 5 lần ⇒ lỗi ngay ô mã |
| Đổi mật khẩu / sửa hồ sơ / avatar | U01, U02 | `PATCH /auth/me/change-password`, `PATCH /auth/me`, `PATCH /coaches/:userId`, `POST /auth/me/avatar` | Có | ✅ |

### 3.2. Khóa học, mua khóa, lịch

| Chức năng | Màn hình | Endpoint BE | Trạng thái | Ghi chú |
|---|---|---|---|---|
| Khám phá khóa (Member + **Guest**) | G01, M02 | `GET /classes` (BE-1, BE-12 `summary`) | Có | ✅ 1 request/trang (bỏ N+1); Guest xem dữ liệu thật, chỉ yêu cầu đăng nhập khi bấm Mua |
| Bộ môn (lọc, tạo khóa) | M02, H09 | `GET /classes/fitness` (BE-11) | Có | ✅ |
| Chi tiết khóa + trạng thái mua | M03 | `GET /classes/:id`, `GET /classes/:id/course-plan` (BE-13 `registration.purchase`) | Có | ✅ Đã mua / **Tiếp tục thanh toán** (giao dịch chờ) / chưa mua + lý do chặn từ BE |
| Mua khóa VietQR, polling, giả lập thu tiền | M04, P01 | `POST /payments/sepay/checkout`, `GET /payments/sepay/:id`, `POST /payments/sepay/mock-confirm` | Có | ✅ |
| Khóa học của tôi | M05, M06 | `GET /enrollments/my`, `GET /payments/my?type=CLASS` (BE-6), `GET /attendance/my`, `GET /refunds/my` | Có | ✅ Số tiền & ngày mua thật |
| Lịch tập | M09, M10 | `GET /enrollments/my?from&to` (BE-14), `GET /attendance/my` | Có | ✅ Lý do & phương án hủy buổi (BE-20) |
| Hủy / đổi buổi | M16, M17 | `DELETE /enrollments/:id`, `POST /enrollments/:id/transfer` | Có | ✅ |

### 3.3. Điểm danh, hoàn tiền, tập luyện, đánh giá

| Chức năng | Màn hình | Endpoint BE | Trạng thái | Ghi chú |
|---|---|---|---|---|
| Quét QR / mã dự phòng | M11 | `POST /attendance/scan-qr` | Có | ✅ |
| Chuyên cần + phạt + khiếu nại | M12 | `GET /attendance/my`, `GET /attendance/my/summary`, `POST /attendance/penalties/:id/appeal` | Có | ✅ L13: phạt `PENDING` hiển thị "Đang chờ áp dụng" (chỉ xem) |
| Điều kiện hủy khóa | M06, M07 | `GET /refunds/course-cancellation/preview` (BE-16) | Có | ✅ Do BE tính |
| Hủy khóa & theo dõi hoàn tiền | M07, M08 | `POST /refunds/course-cancellation`, `GET /refunds/my`, `GET /refunds/:id` (BE-17) | Có | ✅ Ghi chú Member/Manager tách riêng (L8) |
| Lộ trình tập luyện | M13, H11 | `GET /training-plans`, `GET /training-plans/:id` (BE-17), `POST /training-plans`, `POST /training-plans/results` | Có | ✅ L9: chỉ số = số + đơn vị + ghi chú |
| Đánh giá HLV | M14, H14 | `GET /feedbacks` (BE-22), `POST /feedbacks`, `DELETE /feedbacks/:id` | Có | ✅ Phân bố sao từ BE |

### 3.4. Cửa hàng & thanh toán

| Chức năng | Màn hình | Endpoint BE | Trạng thái | Ghi chú |
|---|---|---|---|---|
| Sản phẩm (ảnh, tồn có thể bán, giới hạn) | S01, S02 | `GET /products`, `GET /products/:id` (`availableStock`, `maxPerOrder`, `maxPerDay`) | Có | ✅ Icon giỏ có badge; "Thêm vào giỏ" + "Mua ngay"; stepper giới hạn `min(còn bán, tối đa/đơn)` |
| Giỏ hàng | S05 | `GET/DELETE /shop/cart`, `POST /shop/cart/items`, `PATCH/DELETE /shop/cart/items/:productId`, `POST /shop/cart/accept-prices` | Có | ✅ Chọn dòng để đặt; cảnh báo từng dòng (hết hàng, vượt giới hạn, giá đổi); giỏ không giữ hàng |
| Thanh toán | S06 | `POST /shop/checkout/preview`, `POST /shop/checkout` (+ `Idempotency-Key`, `expectedTotal`) | Có | ✅ Nhận tại trung tâm / Giao hàng, phí ship, tổng do BE tính ⇒ màn VietQR có sẵn; `PRICE_CHANGED` ⇒ tải lại tổng và yêu cầu bấm lại |
| Sổ địa chỉ | S07 | `GET/POST /shop/addresses`, `PATCH/DELETE /shop/addresses/:id`, `POST …/:id/default` | Có | ✅ Cờ "Ngoài khu vực giao" |
| Đơn của tôi + chi tiết | S03, S08 | `GET /shop/orders?status=PENDING\|ACTIVE\|COMPLETED\|CLOSED`, `GET /shop/orders/:id` | Có | ✅ Tab + số đếm; timeline; QR + mã nhận hàng; mã vận đơn; đếm ngược giữ hàng |
| Hủy / hoàn tiền / đã nhận / đánh giá | S08 | `POST /shop/orders/:id/cancel`, `…/request-refund`, `…/confirm-received`, `POST /shop/order-items/:id/review` | Có | ✅ Đánh giá theo từng dòng đơn đã hoàn tất |
| (API cũ, giữ tương thích) | — | `POST /products/orders`, `GET /products/my/orders`, `POST /products/orders/:id/cancel`, `POST /products/:id/reviews` | Có | Mobile không còn dùng |
| Lịch sử / chi tiết thanh toán | I01 | `GET /payments/my` (BE-6) | Có | ✅ L6: "Hóa đơn" ⇒ "Lịch sử thanh toán" / "Chi tiết thanh toán" (dòng sản phẩm, số tiền đã hoàn) |

### 3.5. Coach

| Chức năng | Màn hình | Endpoint BE | Trạng thái | Ghi chú |
|---|---|---|---|---|
| Tổng quan | H01 | `GET /classes?createdByMe=true` (`summary.studentCount`), `GET /class-schedules?mine=true` (BE-15), `GET /coaches/me/wallet`, `GET /feedbacks` | Có | ✅ Số học viên thật; việc "tạm giữ cho hoàn tiền" |
| Lịch dạy, chi tiết buổi | H02, H03 | `GET /class-schedules?mine=true&from&to`, `GET /class-schedules/:id`, `GET /enrollments/schedule/:id`, `GET /attendance` | Có | ✅ |
| QR điểm danh | H04 | `POST /attendance/generate-qr`, `DELETE /attendance/qr/:id` (BE-18) | Có | ✅ Rời màn ⇒ thu hồi mã |
| Điểm danh thủ công | H05 | `PUT /attendance/schedule/:id` (BE-18) | Có | ✅ 1 request; HLV ghi được "Có phép" (L5) |
| Hoàn tất / hủy buổi | H03, H06 | `PATCH …/complete`, `POST …/cancel` | Có | ✅ |
| Khóa học của tôi / chi tiết | H07, H08 | `GET /classes?createdByMe=true`, `GET /classes/:id/students` (L12), giao dịch ví `DEPOSIT` | Có | ✅ Học viên, chuyên cần, doanh thu gộp **thật** (bỏ ÷0,85 và roster buổi đông nhất) |
| Hồ sơ học viên | H10 | `GET /coaches/me/students/:memberId` (BE-19) | Có | ✅ 1 request |
| Ví & rút tiền | H12, H13 | `GET /coaches/me/wallet` (BE-5), `POST /coaches/me/wallet/withdraw` | Có | ✅ L4: theo từng khóa; số dư khả dụng, tạm giữ, lý do từng khóa do BE trả |
| Tạo khóa / sửa & gửi lại | H09 | `POST /class-schedules/activity-plan` (BE-10), `PATCH /classes/:id/resubmit` (BE-3) | Có | ✅ Lịch được lưu; L3: chọn 1 bộ môn từ danh mục hoặc nhập mới; lý do từ chối (BE-2) |

### 3.6. Giao tiếp & Manager

| Chức năng | Màn hình | Endpoint BE | Trạng thái | Ghi chú |
|---|---|---|---|---|
| Thông báo + badge realtime | N01 | REST `notifications` + socket `notification:new` | Có | ✅ |
| Chat realtime | C01, C02 | REST `chat` + socket `newMessage`, `typing`, `messagesRead`, `presenceChanged` | Có | ✅ Đang soạn, đã đọc, online; polling 5s chỉ khi socket mất kết nối; danh bạ theo khóa chung (L10) |
| Duyệt CV + xem file CV | R02 | `GET /coaches/cv/pending`, `GET /coaches/:id/cv/file` (BE-8), `PATCH …/cv/review` | Có | ✅ "Xem CV": tải PDF có xác thực rồi mở bằng ứng dụng xem PDF (bảng chia sẻ) |
| Duyệt khóa | R03 | `GET /classes?status=PENDING`, `GET /classes/:id/students`, `PATCH /classes/:id/review` | Có | ✅ Lý do từ chối được lưu |
| Duyệt rút tiền | R01, R04 | `GET /coaches/wallet/transactions`, `GET …/:txId` (BE-7), `PATCH …/review` | Có | ✅ |
| Duyệt hoàn tiền | R05 | `GET /refunds`, `GET /refunds/:id`, `PATCH …/approve|reject` | Có | ✅ Gồm hoàn tiền đơn hàng (`ORDER_*`, không trừ ví HLV, nút "Xem đơn hàng") |
| Cửa hàng — tổng quan | R01 | `GET /shop/manage/summary` | Có | ✅ Đơn cần chuẩn bị, chờ nhận, đang giao, sắp hết hàng |
| Đơn hàng — danh sách / chi tiết / chuyển trạng thái | R10, R11 | `GET /shop/manage/orders`, `GET /shop/manage/orders/:id`, `POST …/:id/status` | Có | ✅ Nút theo `allowedTransitions` của BE; SHIPPING bắt buộc mã vận đơn; hủy/hoàn bắt buộc lý do |
| Quét mã nhận hàng | R12 | `POST /shop/manage/pickup/verify`, `POST /shop/manage/orders/:id/pickup` | Có | ✅ Camera QR / nhập tay ⇒ đối chiếu (SĐT che) ⇒ 4 số cuối SĐT ⇒ hoàn tất |
| Tồn kho | R13 | `GET /shop/manage/inventory`, `POST /shop/manage/inventory/:productId`, `GET …/transactions` | Có | ✅ Nhập / điều chỉnh có ghi chú, nhật ký kho, lọc sắp hết |
| Ẩn / hiện đánh giá | S02 (Manager) | `PATCH /shop/manage/reviews/:id` | Có | ✅ Ngay trong chi tiết sản phẩm |

## 4. ✅ Đã nối hoàn chỉnh

Mọi luồng trong bảng mục 3: xác thực (gồm OTP, phiên giới hạn HLV), khám phá/mua khóa (Guest xem được), lịch tập, đổi/hủy buổi, điểm danh, chuyên cần & phạt, hủy khóa & hoàn tiền, lộ trình, đánh giá, cửa hàng đầy đủ (giỏ, checkout 2 hình thức, địa chỉ, đơn theo trạng thái, mã nhận hàng, hoàn tiền, đánh giá) & lịch sử thanh toán, toàn bộ phần HLV (tổng quan, lịch dạy, QR, điểm danh hàng loạt, ví theo khóa, tạo/gửi lại khóa, hồ sơ học viên), chat & thông báo realtime, Manager (CV + file, khóa, rút tiền, hoàn tiền, xử lý đơn hàng, quét mã nhận hàng, tồn kho, ẩn đánh giá).

## 5. ⚠️ Còn hạn chế

| Chức năng | Hạn chế | Lý do / đề xuất |
|---|---|---|
| Guest xem chi tiết khóa | Không có nhãn "Buổi dạy bù" (chỉ là nhãn phụ) | `GET /class-schedules` cần đăng nhập; course-plan đủ cho Guest |
| QR điểm danh | Rời màn chỉ thu hồi được **mã dự phòng**; mã QR (JWT) tự hết hạn sau 10 phút | QR không lưu trạng thái ở BE |
| Push notification (FCM) | Chưa làm | Ngoài phạm vi (BE chưa tích hợp FCM) |
| Quét mã nhận hàng | Cần camera thật (emulator không có ⇒ dùng "Nhập mã thủ công") | — |
| Thêm/sửa sản phẩm, ảnh | Manager làm trên Web | Mobile chỉ nhập/điều chỉnh tồn kho |
| Kiểm thử thiết bị | Chưa chạy thủ công trên emulator/iOS | Đã kiểm tự động: test widget, build APK, test live repository với BE thật |

## 6. ❌ API còn thiếu

Không còn API thiếu cho các màn hiện có. (Tham khảo thêm cho BE nếu muốn tối ưu: `GET /class-schedules` công khai cho khóa đã duyệt; thu hồi QR theo `jti`.)

## 7. 🔀 Điểm lệch — quyết định đã áp dụng

| # | Quyết định | Mobile |
|---|---|---|
| L1 | BE-1 | Guest xem dữ liệu thật; chỉ yêu cầu đăng nhập khi Mua |
| L2 | BE-10 | Wizard gửi lịch thật |
| L3 | 1 bộ môn/khóa | `SportPickerField`: chọn từ danh mục BE-11 hoặc "Nhập bộ môn mới" |
| L4 | Rút tiền theo từng khóa | Checklist ví hiển thị lý do khóa chưa rút được; số dư khả dụng từ BE |
| L5 | HLV phụ trách ghi EXCUSED | Lựa chọn "Có phép" hoạt động với HLV |
| L6 | BE-6 | I01 = Lịch sử / Chi tiết thanh toán |
| L7 | ~~Chưa làm giỏ hàng~~ ⇒ **đợt 3 đã làm giỏ hàng** | Giỏ server + checkout nhiều dòng |
| L8 | `memberNote` / `managerNote` | Ghi chú tách đúng người |
| L9 | Số + đơn vị + ghi chú | Form `ResultForm` mới (ô số, đơn vị, ghi chú), hiển thị "58.5 kg — ghi chú" |
| L10 | Danh bạ theo khóa chung | Dùng danh sách BE |
| L11 | BE-13 | "Tiếp tục thanh toán" |
| L12 | BE-12, BE-19, `/classes/:id/students` | Bỏ mọi ước lượng |
| L13 | Hiện phạt PENDING | "Đang chờ áp dụng", chỉ xem |
| L14 | FE còn dùng `subscription/quota` ⇒ BE giữ, đánh dấu deprecated | Mobile không đọc |

## 8. File đã thêm/sửa, package

- **Package:** `dio`, `flutter_secure_storage` (đợt 1), **`socket_io_client ^3.1.6`** (đợt 2 — realtime chat/thông báo theo yêu cầu mục D).
- **Mới (đợt 2):** `lib/core/network/realtime_client.dart`, `lib/api/student_json.dart`, `lib/features/classes/presentation/widgets/sport_picker_field.dart`, `lib/features/training/presentation/result_form.dart`, `test/flutter_test_config.dart`, `test/live/live_api_test.dart`.
- **Sửa chính (đợt 2):** 14 `*_api_repository.dart` (bỏ ước tính, dùng API mới), `lib/api/{class,payment,training}_json.dart`, entity (`TrainingMetric`, `InvoiceLine`, `ProductOrderLine`, `PenaltyStatus.pending`, `OrderCancelReason.byManager`, `CoachWallet.availableOverride`), `ManagerRepository.cvFile`, `NotificationRepository.changes`, màn A05/A06, I01, đơn hàng, chuyên cần, wizard tạo khóa, form kết quả tập, duyệt CV; `env.dart` (mặc định API thật), `api_client.dart` (`getBytes` có xác thực), `media_service.dart` (`shareFile`), mock tương ứng.
- `git diff --stat -- Mobile`: 57 file sửa (+597/−237) + 24 file/thư mục mới (đợt 2).
- **Đợt 3 — cửa hàng (không thêm package):**
  - Feature mới `lib/features/shop/`: `domain/entities/shop.dart`, `domain/repositories/shop_repository.dart`, `data/shop_{api,mock}_repository.dart`, `data/shop_repository_provider.dart` (`MOCK_FEATURES=shop`), `presentation/{shop_labels,shop_action}.dart` (`ShopErrors`: mọi mã lỗi ⇒ tiếng Việt), `presentation/providers/shop_providers.dart` (`cartProvider`, `cartCountProvider`…), màn `cart_screen`, `checkout_screen`, `address_screens`, `orders_screen`, `order_detail_screen`, `manager_order_screens`, `pickup_scan_screen`, `inventory_screens`, widget `cart_button`, `order_sections`.
  - `lib/api/shop_json.dart`; mock `lib/mock/shop_operations.dart` (máy trạng thái, kho, job hết hạn/quá hạn nhận/tự hoàn tất, khóa đặt hàng), bảng mock `CartItemRow`, `AddressRow`, `ShopOrderRow`, `OrderLineRow`, `OrderHistoryRow`, `InventoryTxRow`; seed đơn ở đủ trạng thái.
  - Sửa: `products` (bỏ đặt hàng cũ; `availableStock`, `maxPerOrder`, đánh giá ẩn), `refunds` (lý do `order*`, `orderId/orderCode`), `notifications` (`orderUpdated` ⇒ mở chi tiết đơn), `payments` (sau thanh toán ⇒ chi tiết đơn), Tổng quan Manager (khối Cửa hàng), router + `AppRoutes` (`/cart`, `/checkout`, `/addresses`, `/orders/:id`, `/manager/orders…`, `/manager/pickup-scan`, `/manager/inventory…`), `ApiClient.post(headers:)`, `ApiResponse.raw`, icon `cart/truck/inventory`. Xóa `products/presentation/screens/orders_screen.dart` (thay bằng `shop/…/orders_screen.dart`).
  - Test: `test/features/shop_api_repository_test.dart` (repository + `cartProvider`), nhóm "Cửa hàng" trong `test/mock/mock_flows_test.dart`, màn mới trong `screen_sweep_test.dart`, luồng đặt hàng trong `test/live/live_api_test.dart`.

## 9. Cấu hình & chạy thử

| Mục đích | Lệnh |
|---|---|
| API thật — Android emulator (BE ở máy dev cổng 8080) | `flutter run` |
| BE local theo `BE/.env.local` (cổng 8081) | `flutter run --dart-define=API_BASE_URL=http://10.0.2.2:8081` |
| Thiết bị thật trong LAN | `flutter run --dart-define=API_BASE_URL=http://<IP-máy>:8081` |
| Dữ liệu giả lập toàn bộ | `flutter run --dart-define=USE_MOCK=true` |
| Ép vài chức năng chạy mock | `--dart-define=MOCK_FEATURES=chat,training` |
| Kiểm chứng repository với BE thật | `flutter test test/live --dart-define=LIVE_API_URL=http://localhost:8081` |
| Dùng file cấu hình (đợt 3) | `flutter run --dart-define-from-file=env/local.json` (BE local 8081) · `env/mock.json` (giả lập) |

BE local + PostgreSQL Docker: xem [`BE_API_CHANGES.md`](BE_API_CHANGES.md) mục 6. Giả lập "đã thu tiền": nút DEV trên màn VietQR (chỉ khi `APP_ENV=dev`/mock; BE cần `SEPAY_MOCK_MODE=true`). Mock cửa hàng: đơn `o-7` của `member@demo.vn` đang chờ nhận với mã `K7M2Q9XA` (màn quét mã có nút DEV nhập mã mẫu).
