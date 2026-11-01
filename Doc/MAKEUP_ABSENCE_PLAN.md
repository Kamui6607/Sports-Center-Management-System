# Kế hoạch: Báo vắng · Học bù · Đổi buổi cho học viên

> Trạng thái: **ĐÃ LÀM XONG CẢ 2 GIAI ĐOẠN** (duyệt 02/11/2026). Chưa commit; migration chưa áp lên Render (xem mục 9).
> Phạm vi: BE + Mobile (Member, Coach). Web Manager chỉ hiển thị (mục 5.3).

## 1. Hiện trạng & vấn đề

| Ai | Làm được | Ghi chú |
|---|---|---|
| HLV | Dời giờ 1 buổi (≥ 24h, tối đa 2 lần/buổi) | Học viên được báo, không đi được ⇒ hủy hoàn 100% hoặc "đổi buổi" |
| HLV | Hủy buổi ⇒ dạy bù (cả lớp chuyển sang buổi bù) hoặc hoàn 1 buổi | Buổi bù chỉ sinh ra khi hủy buổi |
| Học viên | Hủy 1 buổi: ≥ 24h hoàn 80%, < 24h không hoàn | |
| Học viên | Đổi buổi: buổi khác của khóa hoặc khóa tương đương (cùng HLV, cùng hạng); ≥ 24h; 2 lần/khóa | §8 `GYM_SCOPE_CHANGES.md` |

Vấn đề:
1. **Không có nguồn buổi để đổi.** Học viên mua trọn khóa ⇒ đã có chỗ ở mọi buổi; buổi bù chỉ có khi HLV hủy (cả lớp đã được chuyển); khóa tương đương cùng HLV hiếm khi có ⇒ danh sách gần như luôn trống.
2. **Bế tắc**: không có buổi ⇒ nút bị khóa, không giải thích, không chỉ lối ra (chỉ còn hủy mất 20% hoặc bỏ buổi bị tính vắng).
3. **Không có báo vắng**: ốm/bận dưới 24h ⇒ HLV không biết, bị tính *vắng không phép*. Trạng thái `EXCUSED` có nhưng chỉ HLV/Quản lý đặt.
4. **Lệch chỗ ngồi**: người đổi sang khóa tương đương chiếm chỗ ⇒ có thể làm khóa đó "Hết chỗ", chặn người mua trọn khóa.
5. Khi HLV dời giờ, gợi ý "đổi buổi" cũng rơi vào vấn đề 1.

## 2. Mục tiêu

- Học viên **luôn có lối ra rõ ràng** cho một buổi không đi được: đổi buổi (nếu có) · báo vắng · xin học bù · hủy (kèm số tiền hoàn).
- Tạo **nguồn buổi bù thật**: HLV mở buổi bù cho khóa, hoặc xếp học viên vào buổi có sẵn còn chỗ.
- Không đổi luật tiền hiện có (85% về HLV dạy, hoàn theo đơn giá buổi của học viên).

## 3. Quy tắc nghiệp vụ

### 3.1. Báo vắng (Giai đoạn 1)
- Học viên bấm **"Báo vắng"** trên buổi đang giữ chỗ, bất cứ lúc nào **trước giờ bắt đầu**; nhập lý do (bắt buộc, ≥ 5 ký tự).
- Kết quả: tạo `Attendance` = `EXCUSED`, ghi chú "Học viên báo vắng: <lý do>"; chỗ **vẫn giữ** (`BOOKED`) để lịch sử / danh sách lớp đúng.
- **Không tính** vào tỷ lệ chuyên cần / phạt (đã đúng ở `computeAttendanceBuckets`). **Không hoàn tiền.**
- Giới hạn **2 lần báo vắng / khóa đã mua** (`ATTENDANCE.MEMBER_ABSENCE_MAX_PER_COURSE`); chỉ đếm báo vắng còn hiệu lực (đã hủy báo vắng thì không tính).
- **Hủy báo vắng** trước giờ học ⇒ xóa bản ghi `EXCUSED` do học viên tạo.
- Vẫn đến lớp ⇒ HLV quét thẻ (ghi đè EXCUSED, đã có) **hoặc** học viên tự quét QR: cho phép ghi đè `EXCUSED` *do chính học viên báo* thành `PRESENT` (sửa chốt chặn 409 hiện tại trong `scanQr`).
- HLV nhận thông báo; danh sách lớp hiện tag **"Báo vắng"** + lý do.

### 3.2. Đổi buổi — khi không có buổi (Giai đoạn 1)
- `transfer-options` trả thêm `emptyReason`: `NO_MAKEUP_OR_EQUIVALENT` · `ALL_FULL` · `ALL_CONFLICT` · `TOO_LATE` · `LIMIT`.
- Mobile hiện lý do bằng lời + 3 lối ra: **Xin học bù** (GĐ2; GĐ1 là "Báo vắng") · **Nhắn HLV** (mở chat với tin soạn sẵn: khóa, buổi, giờ) · **Hủy buổi** (hiện số tiền hoàn dự kiến).
- Dòng mô tả dưới nút "Đổi sang buổi khác" nói rõ nguồn buổi: *"Chỉ đổi được sang buổi bù hoặc khóa tương đương cùng HLV"*.

### 3.3. Yêu cầu học bù (Giai đoạn 2)
- Khi báo vắng, học viên có thể bật **"Xin buổi học bù"** ⇒ tạo `MakeupRequest` `PENDING` gắn với chỗ của buổi bị vắng.
- Mỗi khóa đã mua: tối đa **2 yêu cầu học bù** (dùng chung giới hạn 2 lần báo vắng).
- HLV phụ trách khóa xử lý (Mobile, mục "Việc cần làm"):
  1. **Xếp vào buổi có sẵn** còn chỗ: buổi của chính khóa, buổi bù đang mở, hoặc buổi của khóa khác **cùng HLV, cùng hạng** (giống luật đổi buổi hiện có — để 85% đúng người dạy). Kiểm tra trùng giờ, phạt chuyên cần, chỗ trống.
  2. **Mở buổi bù** (3.4) rồi xếp một hoặc nhiều yêu cầu vào đó.
  3. **Từ chối** kèm lý do.
- Học viên **tự chọn** được buổi bù đang mở của khóa mình khi có yêu cầu `PENDING` (danh sách hiện trong `transfer-options` / màn yêu cầu).
- Xếp xong ⇒ yêu cầu `SCHEDULED`; tạo `Enrollment` mới ở buổi đích (`makeupRequestId`, `sourceClassId` = khóa đã trả tiền); chỗ ở buổi vắng giữ nguyên `BOOKED` + `EXCUSED`. Học viên nhận thông báo.
- **Từ chối / hết hạn** (khóa kết thúc + 14 ngày, `MAKEUP_REQUEST_EXPIRE_DAYS`): nếu yêu cầu được gửi **≥ 24h trước buổi vắng** ⇒ tự tạo hoàn **80%** tiền buổi (`MEMBER_CANCEL_SESSION`, như hủy đúng hạn) — học viên không thiệt vì chờ HLV. Gửi < 24h ⇒ không hoàn.
- Học viên **rút yêu cầu** khi còn `PENDING` ⇒ `CANCELLED` (báo vắng vẫn giữ).
- Học bù **không tính** vào giới hạn 2 lần đổi buổi; chuyên cần của buổi học bù tính cho **khóa đã trả tiền** (`sourceClassId`).

### 3.4. HLV mở buổi bù (Giai đoạn 2)
- HLV tạo **buổi bù mở** cho một khóa `APPROVED`: ngày/giờ/phòng, sức chứa (≤ sức chứa khóa). Thời gian: từ ngày bắt đầu khóa tới **ngày kết thúc + 14 ngày**; cách hiện tại ≥ 2 giờ.
- Kiểm tra trùng phòng / trùng lịch dạy HLV như dời lịch.
- `ClassSchedule.isMakeupSlot = true`, `makeupForId = null`. **Không phải buổi chính**: loại khỏi mọi chỗ đang lọc "buổi chính" bằng `makeupForId = null` (13 chỗ: đơn giá buổi, hạn mở bán, tổng số buổi, ngày kết thúc khóa, đánh giá kỳ HLV, mock…). Không bán, không tự ghi danh.
- Mở xong ⇒ thông báo cho học viên có yêu cầu `PENDING` của khóa đó.
- Buổi bù không ai đăng ký ⇒ HLV hủy tự do (không tính vào tỷ lệ hủy buổi của HLV).

### 3.5. Chỗ ngồi (Giai đoạn 2)
- Người vào từ khóa khác (đổi buổi / học bù) chiếm chỗ thật của buổi đó (vẫn tính sức chứa).
- Giới hạn **chỗ khách** mỗi buổi chính: `max(1, 10% sức chứa)` (`TRANSFER_GUEST_SEATS_PERCENT`) ⇒ khóa không bị "Hết chỗ" vì người đổi sang. Buổi bù mở không giới hạn chỗ khách.

## 4. Thay đổi BE

### 4.1. Dữ liệu (migration chỉ THÊM, idempotent)
- `ClassSchedule.isMakeupSlot Boolean @default(false)`.
- `Enrollment.makeupRequestId String? @unique`.
- Bảng `MakeupRequest`: `id, memberId, missedEnrollmentId (unique), paidClassId, coachId, reason, status, requestedAt, resolvedAt, resolvedById, targetScheduleId, rejectReason, expiresAt, refundId`.
- Enum `MakeupRequestStatus { PENDING SCHEDULED REJECTED EXPIRED CANCELLED }`.
- `NotificationType` thêm: `MEMBER_ABSENCE`, `MAKEUP_REQUESTED`, `MAKEUP_SCHEDULED`, `MAKEUP_REJECTED`, `MAKEUP_SLOT_OPENED`.
- Migration tạo bằng `prisma migrate diff`, áp lên DB local; **anh/chị tự áp lên Render** (kèm hướng dẫn `pg_dump` trước).

### 4.2. API
| Vai trò | Endpoint | Việc |
|---|---|---|
| MEMBER | `POST /enrollments/:id/absence { reason, requestMakeup? }` | Báo vắng (+ xin học bù — GĐ2) |
| MEMBER | `DELETE /enrollments/:id/absence` | Hủy báo vắng (trước giờ học) |
| MEMBER | `GET /enrollments/:id/transfer-options` | **Sửa**: thêm `emptyReason`; GĐ2 thêm buổi bù mở khi có yêu cầu PENDING |
| MEMBER | `GET /makeup-requests/my` · `DELETE /makeup-requests/:id` | Xem / rút yêu cầu |
| MEMBER | `POST /makeup-requests/:id/choose { scheduleId }` | Tự chọn buổi bù đang mở |
| COACH | `GET /makeup-requests?status=` | Yêu cầu của các khóa mình dạy |
| COACH | `GET /makeup-requests/:id/options` | Buổi có thể xếp (chỗ trống, xung đột) |
| COACH | `POST /makeup-requests/:id/assign { scheduleId }` · `POST /makeup-requests/:id/reject { reason }` | Xếp / từ chối |
| COACH | `POST /classes/:id/makeup-slots { startTime, endTime, roomId, capacity?, assignRequestIds? }` | Mở buổi bù (+ xếp luôn) |
| COACH | `GET /coaches/me/dashboard` | **Sửa**: thêm việc cần làm "N yêu cầu học bù" |

- `POST /attendance/scan-qr`: cho ghi đè `EXCUSED` do học viên tự báo vắng.
- Job bảo trì lớp học (đã có): hết hạn yêu cầu `PENDING` + hoàn 80% nếu đủ điều kiện.

### 4.3. Kiểm thử
- E2E mới `tests/makeup-absence.e2e.ts` (DB local): báo vắng/hủy báo vắng/giới hạn 2, tự quét QR sau báo vắng, `emptyReason`, yêu cầu học bù → xếp / mở buổi bù / tự chọn / từ chối + hoàn 80% / hết hạn, chỗ khách 10%, buổi bù không làm lệch đơn giá & hạn mở bán & đánh giá kỳ HLV.
- Chạy lại hồi quy: `wallet-attendance`, `attendance-coach-scan`, `coach-term`, `shop`… (`npm run test:local`).

## 5. Thay đổi giao diện

### 5.1. Mobile — Học viên
- **Chi tiết buổi học** (`my_session_screen.dart`), mục "Thay đổi lịch" gồm 3 dòng, mỗi dòng có mô tả luật + trạng thái khóa:
  - *Đổi sang buổi khác* — sheet chọn buổi; trống ⇒ khối giải thích + nút **Nhắn HLV** / **Báo vắng & xin học bù** / **Hủy buổi**.
  - *Báo vắng* — sheet: lý do + công tắc "Xin buổi học bù" (GĐ2) + "Còn N/2 lần cho khóa này".
  - *Hủy buổi này* — như cũ.
- Banner trạng thái trên buổi: "Đã báo vắng · <lý do>" (nút Hủy báo vắng) · "Đang chờ HLV xếp buổi bù" (nút Rút yêu cầu / Chọn buổi bù đang mở) · "Đã xếp học bù: <buổi>" (mở buổi đó) · "HLV từ chối: <lý do> — đã tạo hoàn …đ".
- Lịch của tôi: buổi học bù có tag **"Học bù"**; buổi đã báo vắng có tag **"Báo vắng"**.

### 5.2. Mobile — HLV
- **Trang chủ › Việc cần làm**: "N yêu cầu học bù" ⇒ màn **Yêu cầu học bù** (nhóm theo khóa, lọc trạng thái).
- **Chi tiết yêu cầu**: học viên, buổi vắng, lý do; nút **Xếp vào buổi** (danh sách buổi còn chỗ + cảnh báo trùng giờ) · **Mở buổi bù** (form ngày/giờ/phòng/sức chứa, chọn nhiều yêu cầu cùng khóa để xếp luôn) · **Từ chối** (lý do bắt buộc).
- **Chi tiết khóa**: nút "Mở buổi bù"; buổi bù mở có tag **"Buổi bù"**.
- **Danh sách lớp / điểm danh**: tag "Báo vắng" (+ lý do), "Học bù · từ khóa X".

### 5.3. Web Manager (chỉ hiển thị)
- Lịch học / chi tiết buổi: tag "Buổi bù mở"; roster hiện "Báo vắng", "Học bù".
- Hoàn tiền: dùng lý do có sẵn `MEMBER_CANCEL_SESSION` (ghi chú "Yêu cầu học bù bị từ chối / hết hạn").

## 6. Thứ tự làm

**Giai đoạn 1** (không cần migration bảng mới — chỉ dùng `Attendance` + giới hạn đếm)
- [x] BE: báo vắng / hủy báo vắng, giới hạn 2/khóa, thông báo HLV; `scanQr` ghi đè EXCUSED tự báo; `emptyReason` trong `transfer-options`; e2e.
- [x] Mobile: 3 lối ra ở chi tiết buổi, sheet báo vắng, khối giải thích khi không có buổi đổi + Nhắn HLV (tin soạn sẵn), tag "Báo vắng" ở lịch học viên & roster HLV; mock + test.
- [x] `dart format lib test`, `flutter analyze`, `flutter test`; cập nhật `GYM_SCOPE_CHANGES.md` (§27) và mục 11 `MOBILE_UI_PLAN.md`.

**Giai đoạn 2**
- [x] BE: migration (4.1); loại `isMakeupSlot` khỏi 13 chỗ lọc "buổi chính"; API học bù + mở buổi bù + tự chọn; chỗ khách 10%; job hết hạn + hoàn 80%; dashboard HLV; e2e + hồi quy.
- [x] Mobile Member: công tắc xin học bù, banner trạng thái, chọn buổi bù, tag "Học bù".
- [x] Mobile Coach: việc cần làm, màn Yêu cầu học bù, xếp/mở buổi bù/từ chối, tag roster.
- [x] Web: tag "Buổi bù mở"/"Báo vắng"/"Học bù" (chỉ hiển thị).
- [x] Hướng dẫn áp migration lên Render (backup `pg_dump` trước). Không commit/push.

## 7. Điểm đã chọn mặc định (sửa trước khi DUYỆT nếu muốn khác)

| # | Câu hỏi | Mặc định đề xuất |
|---|---|---|
| 1 | Giới hạn báo vắng | 2 lần / khóa đã mua (dùng chung cho xin học bù) |
| 2 | Ai duyệt học bù | HLV phụ trách khóa (Mobile); Quản lý không tham gia |
| 3 | Học bù sang khóa khác? | Có, nếu **cùng HLV, cùng hạng** (giống luật đổi buổi hiện có) |
| 4 | Báo vắng có hoàn tiền? | Không. Chỉ hoàn 80% khi yêu cầu học bù bị từ chối/hết hạn và đã gửi ≥ 24h trước buổi |
| 5 | Hạn dùng yêu cầu học bù | Khóa kết thúc + 14 ngày; buổi bù mở cũng trong khoảng này |
| 6 | Chỗ khách mỗi buổi chính | max(1, 10% sức chứa) |
| 7 | Báo vắng có nhả chỗ? | Không nhả (giữ `BOOKED` + `EXCUSED`) để lịch sử và tiền buổi giữ nguyên |

## 8. Thay đổi so với kế hoạch

| # | Kế hoạch | Thực tế | Lý do |
|---|---|---|---|
| 1 | `POST /classes/:id/makeup-slots` | `POST /makeup-requests/slots { classId, … }` | Gom mọi API học bù vào một module `makeup-requests`. |
| 2 | Học viên chỉ xin học bù lúc báo vắng | Thêm `POST /enrollments/:id/makeup-request` (xin sau, khi đã báo vắng) | Học viên báo vắng không bật công tắc vẫn xin được về sau. |
| 3 | Dashboard HLV có trường mới ở BE | Mobile đếm qua `GET /makeup-requests?status=PENDING&limit=1` | BE không có endpoint dashboard HLV (Mobile tự ghép). |
| 4 | Chỗ khách "không làm khóa Hết chỗ" | Chỗ khách vẫn tính sức chứa; giới hạn max(1, 10%) chỉ **hạn chế** ảnh hưởng | Sức chứa là giới hạn thật của buổi học. |
| 5 | — | Đặt thẳng buổi bù mở (`POST /enrollments`) ⇒ 400 `MAKEUP_SLOT_NOT_BOOKABLE`; đổi buổi thường không thấy buổi bù mở | Buổi bù chỉ dành cho yêu cầu học bù. |
| 6 | — | Chỗ học bù không đổi buổi được (`MAKEUP_ENROLLMENT_NOT_TRANSFERABLE`); hủy chỗ học bù ⇒ yêu cầu `CANCELLED` (hủy ≥ 24h vẫn hoàn 80% như hủy 1 buổi) | Tránh chuỗi đổi/bù chồng nhau. |
| 7 | — | Đã xếp học bù ⇒ không hủy báo vắng / hủy / đổi chỗ buổi vắng (409 `MAKEUP_ALREADY_SCHEDULED`) cho tới khi hủy buổi học bù | Giữ nhất quán chỗ ↔ yêu cầu. |
| 8 | — | Chuyên cần của chỗ đổi buổi / học bù sang khóa khác tính cho **khóa đã trả tiền** (`sourceClassId`) | Đúng tinh thần §3.3. |
| 9 | — | Mock Mobile không tạo bản ghi hoàn tiền khi từ chối (chỉ thông báo) | Mock chỉ phục vụ UI; BE thật tạo hoàn. |

## 9. Áp migration lên Render (anh/chị tự làm)

Migration `BE/prisma/migrations/20261102000000_makeup_absence` chỉ **thêm** (enum `NotificationType` 5 giá trị, enum `MakeupRequestStatus`, cột `ClassSchedule.isMakeupSlot/slotCapacity`, `Enrollment.makeupRequestId`, bảng `MakeupRequest`), chạy lại an toàn.

1. Backup trước: `pg_dump "<RENDER_DATABASE_URL>" -Fc -f backup_truoc_makeup_20261102.dump`
2. Áp: trong `BE/`, với `DATABASE_URL` trỏ Render: `npx prisma migrate deploy`
3. Kiểm: `npx prisma migrate status` ⇒ "Database schema is up to date!"; deploy lại BE.

## 10. Kiểm thử đã chạy (02/11/2026, DB Docker local)

- BE: `npm run test:local -- makeup-absence` **51/51** (GĐ1 21 + GĐ2 30). Hồi quy: wallet-attendance 35/35, attendance-coach-scan 24/24, shop 141/141, admin-web 90/90, coach-term 104/104, coach-checkin 51/51. `mobile-api` 7 lỗi và `auth-security` 10 lỗi OTP — **có sẵn từ trước** (chạy lại trên code gốc cho đúng các lỗi đó).
- Mobile: `flutter analyze` 0 lỗi mới, `flutter test` **178 pass**.
- Web: `npm run typecheck` sạch. Chưa kiểm tay trên trình duyệt.
- Lưu ý chạy e2e local: `CLOUDFLARE_TURNSTILE_SECRET_KEY= npm run test:local -- <suite>`.
