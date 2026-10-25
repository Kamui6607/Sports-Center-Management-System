# 🎫 Luồng gói thành viên (hội viên chỉ tập gym tự do, không mua khóa HLV)

> **Ngày:** 25/10/2026 · **Phạm vi:** `BE/`, `Mobile/`, `FE/` · Không commit/push. Migration mới chỉ áp DB local.
>
> Người dùng yêu cầu tự đề xuất và làm luôn — phần dưới là phương án đã chọn và đã làm.

## 1. Hiện trạng trước khi sửa

| Vấn đề | Hậu quả |
|---|---|
| Web không có trang quản lý gói (link Dashboard `/manager/membership-plans` dẫn vào trang trống); BE chỉ có **tạo** + **bật/tắt**, không **sửa / xóa**; Manager không xem được gói đã tắt | Manager không cấu hình được gói |
| QR thẻ thành viên = `userId` **tĩnh** (`GET /memberships/verify/:userId`) | Chụp màn hình là dùng chung thẻ được |
| Không nhắc gia hạn; không phân biệt gói **đang dùng** / gói **mua trước (xếp hàng)** | Hội viên bị hết hạn bất ngờ; app hiện sai ngày bắt đầu |
| Không có nhật ký vào cửa của hội viên | Không đối soát được ai đã vào, thẻ hết hạn vẫn vào |
| Cấp gói theo số ngày **hiện tại** của gói (đã sửa ở đợt hardening) | Đổi gói trong lúc khách chuyển khoản làm khách thiệt |
| Manager không hủy được gói của hội viên (VD chuyển nhượng, vi phạm nội quy) | Không có đường hoàn tiền hợp lệ |

## 2. Luật nghiệp vụ đã chốt

### 2.1. Cấu hình gói (Manager — Web › Gói thành viên)
- CRUD đầy đủ: **tên, số ngày hiệu lực (1–3650), giá (≥ 1.000đ), mô tả, quyền lợi (tối đa 8 dòng), gói nổi bật, thứ tự hiển thị**, bật/tắt bán.
- **Sửa giá/số ngày chỉ áp dụng giao dịch mới** — giao dịch cũ & gói đang chờ chuyển khoản dùng ảnh chụp lúc mua.
- **Xóa** chỉ khi gói **chưa từng được mua / chưa có giao dịch**; đã có người mua ⇒ 409 `PLAN_IN_USE`, hãy **tắt bán** (gói đã bán vẫn hiệu lực).
- Trang quản lý kèm số liệu từng gói: số hội viên đang dùng, số lượt bán, doanh thu (theo số tiền thực thu).

### 2.2. Mua & gia hạn (Member — Mobile)
- Mua bằng VietQR (SePay) như cũ; tiền về mới cấp gói.
- Còn gói ⇒ **cộng dồn**: gói mới bắt đầu ngay khi gói hiện tại hết hạn (gói "xếp hàng").
- Tối đa **3 gói xếp hàng** cùng lúc (tránh bấm nhầm mua nhiều lần) ⇒ 409 `MEMBERSHIP_QUEUE_LIMIT`.
- Hội viên **không tự hủy** gói (chính sách phòng gym — đã mua là không hoàn); Manager hủy được (mục 2.4).

### 2.3. Thẻ thành viên & vào cửa
- Thẻ hiển thị **mã QR động** ký bằng JWT (`MEMBER_PASS`, sống **60 giây**, app tự làm mới) — ảnh chụp màn hình hết hạn sau 1 phút.
- Manager (Web hoặc Mobile chế độ demo) / HLV (Mobile) **quét** ⇒ `POST /memberships/pass/verify` ⇒ trả *Hợp lệ / Hết hạn / Chưa có gói / Tài khoản bị khóa* và **ghi nhật ký vào cửa** (`MemberPassScan`). Hệ thống không tự khóa ai — người quét quyết định.
- Thẻ cho thấy: tên, ảnh, gói đang dùng, **hiệu lực đến (gồm cả gói xếp hàng)**, số ngày còn lại, thanh tiến độ, các gói xếp hàng.
- `GET /memberships/verify/:userId` (QR tĩnh cũ) chỉ còn cho **Manager tra cứu** (không dùng để vào cửa).

### 2.4. Manager hủy gói của hội viên
- `POST /memberships/:id/cancel { reason, refundAmount? }`: gói → `CANCELLED`; các gói xếp hàng phía sau **dời lên** đúng số ngày bị cắt.
- Hoàn tiền (tùy chọn) tối đa = *giá trị còn lại* = tiền đã trả × (ngày còn lại ÷ tổng ngày) ⇒ tạo yêu cầu hoàn `MEMBERSHIP_CANCELLED` đi qua luồng Hoàn tiền hiện có (Manager chuyển khoản rồi duyệt).

### 2.5. Nhắc gia hạn (job 5 phút, idempotent theo `Membership.reminderStage`)
- Còn **7 ngày** và **1 ngày** tới ngày hết hạn cuối cùng (không có gói xếp hàng nối tiếp) ⇒ thông báo "Gia hạn ngay".
- Hết hạn ⇒ chuyển `EXPIRED` + thông báo.

## 3. API mới / thay đổi

| Method | Path | Ai | Ghi chú |
|---|---|---|---|
| GET | `/membership-plans` | mọi người đã đăng nhập | gói đang bán, theo `sortOrder` rồi giá |
| GET | `/membership-plans/manage` | MANAGER | mọi gói + số liệu |
| POST | `/membership-plans` | MANAGER | thêm `benefits`, `isFeatured`, `sortOrder` |
| PATCH | `/membership-plans/:id` | MANAGER | sửa (chỉ áp dụng giao dịch mới) |
| PATCH | `/membership-plans/:id/toggle` | MANAGER | như cũ |
| DELETE | `/membership-plans/:id` | MANAGER | 409 `PLAN_IN_USE` nếu đã bán |
| GET | `/memberships/my` | MEMBER/COACH | thêm `current`, `queued[]`, `validUntil`, `totalDaysLeft` |
| GET | `/memberships/my/history` | MEMBER | mọi gói đã mua + số tiền lúc mua |
| GET | `/memberships/my/pass` | MEMBER | mã QR động 60 giây |
| POST | `/memberships/pass/verify` | MANAGER, COACH | quét thẻ ⇒ kết quả + ghi nhật ký |
| GET | `/memberships/pass/scans` | MANAGER | nhật ký vào cửa |
| GET | `/memberships` | MANAGER | thêm lọc `search`, `planId` |
| POST | `/memberships/:id/cancel` | MANAGER | hủy + hoàn (tùy chọn) |

## 4. Dữ liệu (migration `20261025010000_membership_flow`)
- `MembershipPlan`: `benefits TEXT[]`, `isFeatured BOOLEAN`, `sortOrder INT`.
- `Membership`: `reminderStage INT`, `cancelledAt`, `cancelReason`, `cancelledById`.
- Bảng `MemberPassScan` (nhật ký quét thẻ hội viên).
- Enum `RefundReason` thêm `MEMBERSHIP_CANCELLED`.

## 5. Giao diện
- **Mobile — Thẻ thành viên:** thẻ dạng thẻ vật lý (gradient thương hiệu, tên + ảnh, gói, hạn, thanh tiến độ ngày còn lại), QR động có đồng hồ làm mới, danh sách gói xếp hàng, nút Gia hạn, lịch sử mua.
- **Mobile — Chọn gói:** thẻ gói có quyền lợi, nhãn "Phổ biến", giá quy đổi theo tháng, nhắc rõ "bắt đầu sau khi gói hiện tại hết hạn" nếu đang có gói.
- **Web — Gói thành viên:** bảng gói + số liệu, form thêm/sửa, bật/tắt, xóa.
- **Web — Hội viên & thẻ:** danh sách gói của hội viên (lọc trạng thái/gói/tìm tên), hủy gói + hoàn, ô quét thẻ (máy quét mã vạch / dán mã) + nhật ký vào cửa.

## 6. Kiểm thử
- BE: `npm run test:membership:local` — **29/29** (CRUD + trùng tên + xóa gói đã bán 409, cấp đúng số ngày lúc mua dù Manager sửa gói khi đang chờ CK, gói xếp hàng, lịch sử theo ảnh chụp, số liệu gói, QR động + Manager/HLV quét + Member không quét được, hủy gói + hoàn ≤ giá trị còn lại + gói sau dời lên, duyệt hoàn, nhắc 7 ngày idempotent, hết hạn + thông báo, quét thẻ hết hạn).
- Mobile: `flutter test` 146/146 (thêm case QR động + gói xếp hàng ở mock).
- Web: tạo / xóa gói, quét mã QR động, nhật ký vào cửa, hóa đơn gói — kiểm tay trên trình duyệt với BE local.

## 7. Ghi chú
- Màn quét thẻ trên Web dùng ô nhập (máy quét mã vạch USB gõ mã + Enter, hoặc dán mã) — không dùng camera của máy tính.
- `GET /memberships/verify/:userId` vẫn còn cho tra cứu, nhưng **không** còn được ứng dụng dùng để vào cửa.
