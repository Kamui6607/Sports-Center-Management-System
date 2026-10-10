# 🛠️ Thay đổi Backend cho Mobile (đợt 10/10/2026)

> **Phạm vi:** `BE/` (Express 5 + Prisma + Zod). Bổ sung toàn bộ API còn thiếu trong `Doc/MOBILE_API_INTEGRATION.md` (mục 6 cũ: BE-1 → BE-22), sửa 3 lỗi bảo mật, xử lý các điểm lệch L1–L14. **Không** commit/push, **không** đụng `FE/`, **không** chạy gì trên DB Render.
> **Cập nhật 11/10/2026:** thêm nghiệp vụ **Cửa hàng** — xem [mục 9–14](#-đợt-11102026--nghiệp-vụ-cửa-hàng).
> **Kiểm thử:** 3 bộ e2e mới **136/136 pass** · smoke test end-to-end trên BE đang chạy **37/37 pass** · `tsc --noEmit` sạch · migration mới kiểm chứng trên DB trắng (đã áp trên DB local, **chưa** áp lên Render).

---

## 1. Lỗi bảo mật đã sửa (mục A)

| # | Lỗi cũ | Đã sửa | File |
|---|---|---|---|
| S1 | `POST /auth/forgot-password` trả `resetLink` + `token` trong response ⇒ ai biết email cũng đặt lại được mật khẩu | Không trả token/link; **luôn HTTP 200 + `success:true` + cùng một thông điệp** (kể cả email không tồn tại — trước đây trả 200 kèm `success:false`). Sinh **OTP 6 số** (`crypto.randomInt`), **chỉ lưu hash bcrypt**, hết hạn **15 phút**, **tối đa 5 lần sai**, **gửi lại tối thiểu sau 60 giây** (gửi sớm hơn ⇒ vẫn 200, không sinh mã mới). Email chứa **cả OTP (Mobile) và liên kết (Web)**. So sánh với hash giả khi email không tồn tại để thời gian phản hồi tương đương | `auth.service.ts`, `auth.schema.ts`, `utils/mail.ts`, bảng `PasswordResetOtp` |
| S2 | `PATCH /auth/reset-password` chỉ nhận token | Nhận `{ email, otp, newPassword }` **hoặc** `{ token, newPassword }` (Web giữ nguyên). Mỗi lần thử tăng `attempts` **trước khi** so sánh (compare-and-set ⇒ không vượt 5 lần kể cả gửi song song). Mọi lỗi (email lạ / sai / hết hạn / quá số lần / đã dùng) ⇒ cùng thông điệp, `errors.code = OTP_INVALID`. Thành công ⇒ **thu hồi mọi refresh token**, vô hiệu OTP, ngắt socket | `auth.service.ts` |
| S3 | `POST /auth/login` xét `isActive` trước mật khẩu ⇒ lộ tài khoản bị khóa (403 vs 401) | **Mật khẩu trước**: email lạ / sai mật khẩu ⇒ luôn **401 "Invalid email or password"**. Chỉ khi mật khẩu đúng mới xét `isActive` | `auth.service.ts` |
| S4 (phát hiện khi smoke test) | Hai lần đăng nhập cùng 1 giây sinh **refresh token JWT trùng hệt** ⇒ lỗi unique 409 (VD đăng ký Coach rồi đăng nhập ngay) | Thêm `jti` ngẫu nhiên vào refresh token | `utils/jwt.ts` |

## 2. API đã thêm/sửa (theo mã)

Quyền: 🌐 công khai · 🔓 phiên giới hạn (Coach chưa duyệt) · M = MEMBER · C = COACH · R = MANAGER.

| Mã | Method & path | Quyền | Thay đổi |
|---|---|---|---|
| **BE-1** | `GET /classes`, `GET /classes/:id`, `GET /classes/:id/course-plan` | 🌐 + M/C/R | `optionalAuthenticate`: không gửi token ⇒ Guest, chỉ khóa `APPROVED` + `isActive` (bỏ qua `status`/`createdByMe`), **ẩn email HLV**, `registration: null`. Gửi token hỏng ⇒ vẫn 401 (để client refresh) |
| **BE-2** | `PATCH /classes/:id/review` | R | Lưu `Class.rejectReason` khi REJECT, xóa khi APPROVE; mọi response khóa học có `rejectReason` |
| **BE-3** | **`PATCH /classes/:id/resubmit`** (mới) | C (chủ khóa) | Body giống `activity-plan`. Chỉ khóa `PENDING`/`REJECTED`, chưa có chỗ đặt. Thay thông tin + **toàn bộ lịch**, xóa lý do từ chối ⇒ `PENDING`, báo Manager. Lỗi: `CLASS_NOT_EDITABLE`, `CLASS_HAS_ENROLLMENTS`, `ROOM_CONFLICT`, `COACH_CONFLICT` |
| **BE-4** | xem mục 1 (S1, S2) | 🌐 | |
| **BE-5** | `GET /coaches/me/wallet` | C | **Thêm** `pendingRefundDebit`, `pendingWithdrawal`, `available`, `withdrawEligibility { eligible, blockers[{code,message}], classes[{classId, className, classStatus, netEarned, pendingRefundDebit, remainingSessions, finished, withdrawable, reason}] }` (giữ nguyên `wallet`, `coach`) |
| **BE-6** | **`GET /payments/my?type=CLASS\|ORDER&status&page&limit`** (mới) | M, C | Lịch sử giao dịch của chính mình (thay hóa đơn đã bỏ): `{ id, type, amount, status, method, transactionCode, paidAt, classId, className, orderId, orderStatus, items[], refundedAmount, pendingRefundAmount }`. **Không** tạo lại bảng Invoice |
| BE-6 | `Product.imageUrl` | R ghi / 🌐 đọc | Cột mới; `POST/PATCH /products` nhận `imageUrl` (URL) |
| **BE-7** | **`GET /coaches/wallet/transactions?type=WITHDRAWAL&status&coachId&page&limit`**, **`GET /coaches/wallet/transactions/:txId`** (mới) | R | Lệnh rút kèm `coach {id, userId, fullName, email, phone}`, `wallet {balance, pendingRefundDebit, available}`, `rejectReason` |
| **BE-8** | **`GET /coaches/:profileId/cv/file`** (mới) | R, 🔓/C chủ hồ sơ | Trả PDF (`application/pdf`, `nosniff`), chặn path traversal (chỉ trong `uploads/cvs`) |
| **BE-9** | `POST /auth/login`, `POST /auth/register` (Coach), `POST /auth/refresh-token`, `GET/PATCH /auth/me`, `POST /auth/me/avatar`, `PATCH /auth/me/change-password`, `POST /auth/logout`, `POST /coaches/me/cv` | 🔓 | **Phiên giới hạn**: Coach chưa được duyệt CV (chưa nộp / PENDING / REJECTED) đăng nhập được, response `restricted: true` + **có refresh token**; đăng ký Coach cũng cấp refresh token. Middleware mới `authenticateRestricted` chỉ gắn vào các endpoint hồ sơ/CV — **mọi API khác vẫn 401**. `GET /auth/me` thêm `restricted`. Coach đã duyệt rồi bị khóa ⇒ vẫn 403 |
| **BE-10** | `POST /class-schedules/activity-plan` | C | **Lưu lịch** cùng khóa `PENDING` trong 1 giao dịch, `schedulesCreated` đúng số buổi; mỗi buổi phải ở tương lai, kiểm tra trùng phòng/HLV. Lịch của khóa `PENDING` giữ phòng; khóa `REJECTED` **không** giữ phòng. Báo Manager có khóa chờ duyệt |
| **BE-11** | **`GET /classes/fitness`** (mới) | 🌐 | Danh mục bộ môn = `Class.fitness` khác nhau (bỏ hoa/thường) của khóa đã duyệt |
| **BE-12** | `GET /classes`, `GET /classes/:id` | 🌐 + M/C/R | **Thêm** `summary { mainSessionCount, completedSessionCount, upcomingSessionCount, firstSessionStart, nextSessionStart, lastSessionEnd, minRemainingSlots, studentCount }`, `coach.ratingAverage`, `coach.ratingCount`, `coach.user.avatarUrl` |
| L12 | **`GET /classes/:id/students`** (mới) | C (chủ khóa), R | Học viên thật của khóa + chuyên cần (`attendedCount`, `excusedCount`, `pastSessionCount`, `bookedCount`) + `grossRevenue`, `refundedAmount`, `coachRevenue` |
| **BE-13** | `GET /classes/:id/course-plan` | M | **Thêm** `registration.purchase { status: PURCHASED\|PENDING_PAYMENT\|NONE, paymentId, amountPaid, paidAt, pendingPaymentExpiresAt, refundedAmount, hasPendingRefund }` |
| **BE-14** | `GET /enrollments/my?from&to&classId` | M | Tham số mới (giao khoảng theo giờ buổi học); `schedule.class.coach { id, userId, specialization, user{id, fullName, avatarUrl} }`; sắp theo giờ học khi lọc thời gian |
| **BE-15** | `GET /class-schedules?mine=true` | C, M | C: buổi các khóa mình phụ trách; M: buổi mình đang/đã giữ chỗ (kết hợp được với `from`/`to`/`classId`/`weekday`) |
| **BE-16** | **`GET /refunds/course-cancellation/preview?classId=`** (mới) | M | Không ghi dữ liệu: `{ allowed, deadline, firstSessionStart, paidAmount, refundableAmount, blockReason (PAID_PAYMENT_NOT_FOUND\|REFUND_ALREADY_REQUESTED\|COURSE_CANCEL_TOO_LATE\|NOTHING_TO_REFUND), blockMessage, existingRefundId }` — cùng luật với `POST /refunds/course-cancellation` |
| **BE-17** | **`GET /refunds/:id`** (mới) | M (của mình), R | Kèm `class.coach.user.fullName` (mọi response hoàn tiền) |
| BE-17 | **`GET /training-plans/:id`** (mới) | M chủ plan, C phụ trách, R | Lộ trình + `coach.user` + **`member.user`** + `results[]`; `GET /training-plans` cũng kèm `member.user` |
| **BE-18** | **`PUT /attendance/schedule/:scheduleId`** (mới) | C phụ trách, R | `{ items:[{ memberId, status, note? }] }` (≤ 200) — ghi cả danh sách trong 1 giao dịch; học viên không giữ chỗ ⇒ 400 `MEMBER_NOT_ENROLLED`, không dòng nào được ghi |
| BE-18 | **`DELETE /attendance/qr/:scheduleId`** (mới) | C phụ trách, R | Thu hồi ngay mã dự phòng còn hiệu lực; QR JWT tự hết hạn theo TTL (10 phút) |
| **BE-19** | **`GET /coaches/me/students/:memberId`** (mới) | C | `{ member, attendedCount, pastSessionCount, classes[{classId, className, attended, excused, pastSessions}], plans[] }`; học viên không học khóa nào của HLV ⇒ 403 |
| **BE-20** | `POST /class-schedules/:id/cancel` (+ các đường hủy cũ) | C | Lưu `ClassSchedule.cancelReason` + `cancelResolution (MAKEUP\|REFUND)`; có trong mọi response buổi học |
| **BE-21** | `Order.cancelReason (BUYER\|EXPIRED\|MANAGER)` | — | Ghi khi người mua hủy / hết hạn / Manager hủy. `GET /payments/sepay/:id` của đơn hàng **thêm** `order { id, totalPrice, status, cancelReason, items[{productId, productName, quantity, unitPrice, totalAmount}] }` |
| **BE-22** | `GET /feedbacks?coachId&classId` | đã đăng nhập | `summary` **thêm** `distribution {"1".."5"}` (toàn HLV) và `classSummary {averageRating, totalFeedbacks, distribution}` khi lọc `classId` (giữ nguyên `averageRating`/`totalFeedbacks` cũ) |

### 2.1. Quyết định điểm lệch (mục C)

| Mã | Đã làm |
|---|---|
| L1 | BE-1 — Guest xem dữ liệu thật |
| L2 | BE-10 — wizard gửi lịch thật |
| L3 | BE giữ 1 bộ môn/khóa (`fitness`); danh mục BE-11 |
| **L4** | **Rút tiền theo TỪNG KHÓA** (đúng `PROJECT_OVERVIEW.md` §3.3): tiền 85% của một khóa chỉ rút được khi khóa đã kết thúc (không còn buổi `SCHEDULED` hoặc khóa `COMPLETED`) **và** không còn hoàn tiền `PENDING` của khóa đó. Khóa chờ duyệt/đang dạy **không** chặn tiền khóa khác. `available = min(số dư − tạm giữ − lệnh rút đang chờ, tiền khóa đủ điều kiện − đã rút − đang chờ rút)`. Vẫn giữ luật "1 lệnh rút PENDING tại một thời điểm". Mã lỗi: `CLASS_NOT_COMPLETED`, `BALANCE_HELD_FOR_REFUND`, `AMOUNT_EXCEEDS_AVAILABLE` (mới), `WITHDRAWAL_PENDING`, `INSUFFICIENT_BALANCE` (file `coaches/wallet-eligibility.service.ts`) |
| **L5** | COACH phụ trách buổi được ghi `EXCUSED`; HLV khác vẫn 403. EXCUSED **không tính** vào mẫu chuyên cần/phạt (đã đúng ở `computeAttendanceBuckets`; BE-19 & `/classes/:id/students` cũng loại EXCUSED khỏi số buổi đã qua) |
| L8 | `Refund.memberNote` (ghi khi gửi), `Refund.managerNote` (ghi khi duyệt); cột `note` cũ **giữ hành vi cũ** cho Web. Migration backfill: `note` của yêu cầu chưa hoàn tất ⇒ `memberNote`, đã hoàn tất ⇒ `managerNote` |
| L9 | `ProgressMetric` thêm `note` (chữ, ≤ 200) — vẫn bắt buộc `value` số |
| **L10** | `GET /chat/contacts` lọc theo khóa chung: Member ⇒ HLV các khóa mình đang/đã giữ chỗ; Coach ⇒ học viên của mình + mọi Manager; Manager ⇒ mọi HLV (như cũ). Người đã từng nhắn tin vẫn được giữ trong danh bạ. **Quyền gửi tin không đổi** (vẫn theo vai trò) để không làm mất hội thoại cũ của Web |
| L11 | BE-13 |
| L12 | BE-12 + `GET /classes/:id/students` + BE-19 |
| L14 | FE còn dùng `registration.subscription/quota` (`FE/src/api/classes.api.ts`) và `GET /enrollments/my/quota` ⇒ **giữ**, đánh dấu `@deprecated` trong code |

### 2.2. Realtime (mục D)

- `utils/realtime.ts` giữ tham chiếu Socket.IO dùng chung (tránh vòng import).
- **`notification:new`** phát tới phòng của user mỗi khi tạo thông báo (`createNotification`, `broadcastNotification`, outbox IN_APP). REST vẫn là nguồn chính.
- `PATCH /chat/messages/read` (REST) nay **phát `messagesRead`** như sự kiện socket `markAsRead`.

### 2.3. Thay đổi nhỏ khác

- `POST /coaches/me/cv` trả kèm `certification` vừa lưu (thêm field).
- `GET /coaches/me/wallet/transactions`: HLV chưa có ví ⇒ danh sách rỗng thay vì 404 (đồng nhất với `GET /me/wallet` tự tạo ví).

## 3. Migration

| File | Nội dung | Trạng thái |
|---|---|---|
| `BE/prisma/migrations/20261010000000_mobile_api_gaps/migration.sql` | Bảng `PasswordResetOtp`; enum `ScheduleCancelResolution`, `OrderCancelReason`; cột `Class.rejectReason`, `ClassSchedule.cancelReason/cancelResolution`, `Product.imageUrl`, `Order.cancelReason`, `Refund.memberNote/managerNote` (**chỉ THÊM, nullable**) + backfill `Refund` notes & `Order.cancelReason` | ✅ Sinh bằng `prisma migrate diff` từ schema ở git HEAD; ✅ kiểm chứng trên DB trắng (diff sau khi áp = 0); ✅ đã áp trên DB local; ❌ **chưa** áp lên Render |

> ⚠️ **Lưu ý về lịch sử migration cũ:** 33 migration hiện có **không dựng lại được từ DB trắng** (VD `20261005020000_certification_table` dùng enum `CoachApprovalStatus` chưa từng được tạo bằng migration — có lẽ trước đây dùng `db push`). Không sửa migration cũ (Render đã áp). DB local được dựng bằng `migrate diff --from-empty --to-schema-datamodel <schema HEAD>` rồi `migrate resolve --applied` 33 migration cũ.

## 4. Ảnh hưởng tới Web (báo bên FE)

| Endpoint | Thay đổi | Web cần làm |
|---|---|---|
| `POST /auth/forgot-password` | Không còn `resetLink`/`token` trong response; luôn `success:true`; email có OTP + link | Không (FE không gọi endpoint này) — trang đặt lại mật khẩu bằng link vẫn chạy |
| `PATCH /auth/reset-password` | `token` thành tùy chọn (thêm cách OTP) | Không |
| `POST /auth/login` | (1) Tài khoản khóa + **sai** mật khẩu ⇒ 401 (trước: 403). (2) **Coach chưa duyệt** ⇒ **200** + `restricted:true` (trước: 403) | Web hiện hiển thị "Không có quyền truy cập" khi `/auth/me` trả `isActive:false` (`FE/src/features/auth/Session.tsx`) ⇒ không lỗi; nên thêm màn nộp CV/trạng thái hồ sơ dựa trên `restricted` |
| `POST /auth/register` (COACH) | Thêm `refreshToken`, `restricted` | Không |
| `GET /auth/me`, `POST /auth/refresh-token` | Thêm `restricted`; refresh cho phép Coach chưa duyệt | Không |
| `GET /classes*` | Không cần token (Guest); thêm `summary`, `coach.ratingAverage/ratingCount`, `coach.user.avatarUrl`, `rejectReason`; course-plan thêm `registration.purchase` | Không (chỉ thêm) — có thể bỏ N+1 nếu Web đang tự tính |
| `POST /class-schedules/activity-plan` | **Hành vi mới:** lưu lịch thật, kiểm tra trùng phòng/HLV ⇒ có thể trả **409** | Màn tạo khóa của HLV trên Web nhận lịch thật; xử lý 409 |
| `GET /class-schedules` | Lịch của khóa **PENDING** nay tồn tại (giữ phòng) | Lịch/phòng trên Web có thể thấy buổi của khóa chờ duyệt — lọc theo `class.status` nếu không muốn hiển thị |
| Kiểm tra trùng lịch | Bỏ qua buổi của khóa **REJECTED** | Không |
| `POST /coaches/me/wallet/withdraw` | **Luật mới theo từng khóa** (L4); mã lỗi mới `AMOUNT_EXCEEDS_AVAILABLE` | Hiển thị `available`/`withdrawEligibility` từ `GET /coaches/me/wallet` |
| `GET /coaches/me/wallet/transactions` | Chưa có ví ⇒ `[]` (trước: 404) | Không |
| `POST/PATCH /attendance` | COACH phụ trách được ghi `EXCUSED` (trước: 403) | Có thể mở lựa chọn "Có phép" cho HLV |
| `GET /chat/contacts` | **Lọc theo khóa chung** (L10) | Danh bạ trên Web ngắn hơn (đúng nghiệp vụ) |
| `PATCH /chat/messages/read` | Phát thêm socket `messagesRead` | Không |
| Socket.IO | Sự kiện mới `notification:new` | Có thể dùng thay polling thông báo |
| `PATCH /refunds/:id/approve`, `POST /refunds/course-cancellation` | Thêm `memberNote`/`managerNote`; `note` giữ như cũ; response kèm `class.coach.user` | Không |
| `GET /feedbacks` | `summary` thêm `distribution`, `classSummary` | Không |
| `GET /enrollments/my` | Thêm tham số `from/to/classId`; `schedule.class.coach` | Không |
| `GET /training-plans` | Kèm `member.user`; metric có `note` | Không |
| `POST /coaches/me/cv` | Thêm `certification` | Không |
| Refresh token | Có `jti` (khác nhau mỗi lần) | Không |

## 5. Kiểm thử BE

Hạ tầng mới (cùng phong cách `tests/*.e2e.ts`: tsx + HTTP thật + Prisma), **chỉ chạy trên PostgreSQL local** (helper dừng ngay nếu `DATABASE_URL` không phải localhost):

| Lệnh | Nội dung | Kết quả |
|---|---|---|
| `npm run test:local -- auth-security` | forgot/reset OTP (không lộ email, hash, hết hạn, 5 lần sai, gửi lại 60s, dùng 1 lần, thu hồi refresh token), Web token, thứ tự kiểm tra login, phiên giới hạn | **46/46** |
| `npm run test:local -- mobile-api` | BE-1/2/3/6/8/10–17/20–22, L8–L10, Guest không thấy email/khóa chưa duyệt | **55/55** |
| `npm run test:local -- wallet-attendance` | Ví theo khóa (L4/BE-5), tạm giữ hoàn tiền, BE-7, phân quyền EXCUSED (L5), BE-18, EXCUSED ngoài chuyên cần, BE-19, `/classes/:id/students` | **35/35** |
| `npm run test:smoke:local` (BE đang chạy `npm run dev:local`) | Luồng end-to-end + Socket.IO thật (client tối thiểu bằng WebSocket của Node) | **37/37** |

> 5 bộ e2e cũ (`tests/*.e2e.ts`) **đã hỏng từ trước** đợt này: fixture tạo `role: "MEMBER"` dạng chuỗi sau khi BE chuyển sang bảng `Role` (lỗi `Argument role: Invalid value provided`). Không sửa trong đợt này.

## 6. Chạy thử local (không chạm Render)

```bash
docker run -d --name scms_pg_local -e POSTGRES_USER=scms -e POSTGRES_PASSWORD=scms_local -e POSTGRES_DB=scms_local -p 5440:5432 postgres:15-alpine
```

`BE/.env.local` (đã có, nằm trong `.gitignore` qua `.env.*`) trỏ DB trên, tắt SMTP/Cloudinary/SePay thật, `SEPAY_MOCK_MODE=true`, cổng 8081. Mọi script local chạy qua `scripts/with-local-env.mjs` (đè `.env`, **từ chối** nếu DB không phải localhost):

| Script | Việc |
|---|---|
| `npm run db:migrate:local` | `prisma migrate deploy` lên DB local (DB đã có schema HEAD) |
| `npm run db:seed:local` | seed |
| `npm run dev:local` | chạy BE + Socket.IO |
| `npm run test:local` / `npm run test:smoke:local` | kiểm thử |

> DB local trắng: vì lịch sử migration cũ không dựng lại được (mục 3), dựng như sau: `prisma migrate diff --from-empty --to-schema-datamodel <schema HEAD> --script` ⇒ chạy SQL ⇒ `prisma migrate resolve --applied <từng migration cũ>` ⇒ `npm run db:migrate:local`. `scripts/local-db-sync.mjs` dùng để đồng bộ nhanh khi đang phát triển.

## 7. Áp migration lên DB Render (sau khi bạn kiểm tra)

1. **Backup trước** (máy có `pg_dump` ≥ 15, lấy URL từ `BE/.env`):
   ```bash
   pg_dump "$DATABASE_URL" --format=custom --no-owner --file=backup_before_mobile_api_gaps.dump
   ```
2. Xem trước trạng thái (chỉ đọc): `cd BE && npx prisma migrate status` — phải liệt kê đúng **1** migration chưa áp: `20261010000000_mobile_api_gaps`.
3. (Khuyến nghị) Đối chiếu DB Render với schema HEAD: `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel <schema HEAD> --exit-code` — exit 0 nghĩa là Render đúng như HEAD, migration sẽ áp sạch.
4. Áp: `npx prisma migrate deploy` rồi `npx prisma generate`.
5. Kiểm tra: `npx prisma migrate status` ⇒ "Database schema is up to date!"; khởi động BE và gọi `GET /api/v1/health`, `GET /api/v1/classes/fitness`.
6. Hoàn tác nếu cần: `pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" backup_before_mobile_api_gaps.dump` (migration chỉ thêm cột/bảng nullable nên code cũ vẫn chạy được với DB mới).

## 8. File thay đổi

- **Sửa (47 file, +1366/−194):** `package.json` (script local), `prisma/schema.prisma` (+42 dòng), các module `auth`, `chat`, `class-schedules`, `classes`, `coaches`, `enrollments`, `feedbacks`, `notifications`, `payments`, `products`, `refunds`, `training-plans`, `attendance`; `types/base-entity.ts`, `types/express.d.ts`, `utils/certification.ts`, `utils/jwt.ts`, `utils/mail.ts`.
- **Mới:** `prisma/migrations/20261010000000_mobile_api_gaps/`, `scripts/{with-local-env,local-db-sync,run-e2e}.mjs`, `src/middlewares/{authenticateRestricted,optionalAuthenticate}.ts`, `src/modules/classes/class-summary.service.ts`, `src/modules/coaches/{coach-students,wallet-eligibility}.service.ts`, `src/utils/realtime.ts`, `tests/{auth-security,mobile-api,wallet-attendance}.e2e.ts`, `tests/smoke-mobile.local.ts`, `tests/helpers/{e2e,fixtures}.ts`. `.env.local` (không track).
- **Package mới:** không có.

---

# 🛒 Đợt 11/10/2026 — Nghiệp vụ Cửa hàng

> Thiết kế đầy đủ (mô hình dữ liệu, máy trạng thái, tồn kho, chống phá, API): [`SHOP_FLOW_DESIGN.md`](SHOP_FLOW_DESIGN.md).
> **Kiểm thử:** e2e mới `shop` **105/105** · smoke cửa hàng trên BE đang chạy **23/23** · 3 bộ e2e cũ vẫn **136/136** · smoke cũ **37/37** · `tsc --noEmit` sạch.
> **Migration** `20261011000000_shop_flow`: đã áp trên DB local (có dữ liệu đơn cũ giả lập để kiểm tra chuyển đổi), **chưa** áp lên Render.

## 9. Bảng / field

| Loại | Tên | Ghi chú |
|---|---|---|
| Bảng mới | `Cart`, `CartItem` | Giỏ server, UNIQUE(cartId, productId); `unitPriceSnapshot` để cảnh báo giá đổi; không giữ hàng |
| Bảng mới | `UserAddress` | Sổ địa chỉ (tối đa 10, đúng 1 mặc định) |
| Bảng mới | `OrderStatusHistory` | from/to/actor/reason — ghi ở mọi lần chuyển trạng thái |
| Bảng mới | `InventoryTransaction` (+ enum `InventoryTransactionType`) | IN / RESERVE / RELEASE / SALE / RETURN / ADJUST, kèm `stockAfter`, `reservedAfter` |
| `Product` | `reservedStock`, `imageUrls[]`, `maxPerOrder`, `maxPerDay`, `lowStockThreshold` | `stockQuantity` **đổi nghĩa** ⇒ tồn thực tế; API trả thêm `availableStock` |
| `Order` | `code` (UNIQUE), `fulfillmentType` (enum mới), `subtotal`, `shippingFee`, người nhận/địa chỉ snapshot, `note`, `paymentExpiresAt`, `pickupCodeHash` (UNIQUE) + `pickupCodeNonce`/`pickupDeadline`/`pickupFailedAttempts`/`pickupLockedUntil`, `trackingCode`, `carrier`, `cancelNote`, `cancelledById`, `idempotencyKey`+`idempotencyHash` (UNIQUE userId+key), 10 mốc thời gian | `totalPrice` giữ tên = tổng phải trả |
| `OrderStatus` | Thay toàn bộ: `PENDING_PAYMENT, PAID, PROCESSING, READY_FOR_PICKUP, SHIPPING, DELIVERED, COMPLETED, EXPIRED, CANCELLED, NOT_PICKED_UP, REFUND_REQUESTED, REFUNDED` | Chuyển dữ liệu: PENDING→PENDING_PAYMENT, SUCCESS→COMPLETED, CANCELLED(EXPIRED)→EXPIRED |
| `OrderItem` | `productName`, `productImageUrl` (snapshot) | |
| `ProductReview` | `orderItemId` (UNIQUE), `isHidden`, `hiddenReason`, `hiddenById`, `hiddenAt`; **bỏ** UNIQUE(productId, userId) | Mỗi dòng đơn 1 đánh giá |
| `Refund` | `orderId`, `memberId` **nullable**, lý do `ORDER_CANCELLED`, `ORDER_NOT_PICKED_UP`, `ORDER_LATE_PAYMENT` | HLV mua hàng không có hồ sơ hội viên |
| `User` | `checkoutLockedUntil` | Khóa đặt hàng do để đơn hết hạn |
| `NotificationType` | `ORDER_UPDATED` | |

## 10. API mới / sửa

**Mới — module `src/modules/shop` (`/api/v1/shop`)** — chi tiết + mã lỗi: `SHOP_FLOW_DESIGN.md` §6 và Swagger tag **Shop**:
`GET /config` · giỏ `GET|DELETE /cart`, `POST /cart/items`, `PATCH|DELETE /cart/items/:productId`, `POST /cart/accept-prices` · địa chỉ `GET|POST /addresses`, `PATCH|DELETE /addresses/:id`, `POST /addresses/:id/default` · `POST /checkout/preview`, `POST /checkout` (header `Idempotency-Key`, body `expectedTotal`) · đơn `GET /orders`, `GET /orders/:id`, `POST /orders/:id/{cancel,request-refund,confirm-received}`, `POST /order-items/:id/review` · Manager `GET /manage/summary`, `GET /manage/orders`, `GET /manage/orders/:id`, `POST /manage/orders/:id/status`, `POST /manage/pickup/verify`, `POST /manage/orders/:id/pickup`, `GET /manage/inventory`, `POST /manage/inventory/:productId`, `GET /manage/inventory/:productId/transactions`, `GET /manage/reviews`, `PATCH /manage/reviews/:id`.

**Sửa (chỉ thêm field / tham số, giữ hành vi cũ):**

| Endpoint | Thay đổi |
|---|---|
| `GET /products`, `GET /products/:id` | Thêm `availableStock`, `reservedStock`, `maxPerOrder`, `maxPerDay`, `lowStockThreshold`, `imageUrls`; `GET /:id` nhận token tùy chọn — đánh giá ẩn chỉ Manager thấy |
| `POST/PATCH /products` (Manager) | Nhận thêm `imageUrls`, `maxPerOrder`, `maxPerDay`, `lowStockThreshold`; đổi `stockQuantity` ⇒ ghi nhật ký ADJUST, chặn thấp hơn số đang giữ (409 `STOCK_BELOW_RESERVED`) |
| `POST /products/orders` | Giữ body `{items}` + shape response; nay chạy qua checkout mới (đơn **PICKUP**, áp đủ giới hạn chống phá, nhận header `Idempotency-Key` tùy chọn) |
| `GET /products/my/orders`, `POST /products/orders/:id/cancel` | Giữ; response thêm field mới, `status` theo enum mới |
| `POST /products/:id/reviews` | Giữ; điều kiện mới: có dòng đơn COMPLETED chưa đánh giá (tùy chọn `orderItemId`) |
| `GET /payments/sepay/:id` | `order` thêm `code`, `fulfillmentType`, `subtotal`, `shippingFee`; `expiresAt` của đơn hàng = `Order.paymentExpiresAt` |
| Webhook / mock-confirm / đối soát SePay | Đơn hàng: đủ tiền ⇒ **PAID** + trừ hẳn tồn (SALE) + lịch sử; tiền về khi đơn đã đóng ⇒ không khôi phục, **tự tạo Refund `ORDER_LATE_PAYMENT`**; lệch tiền ⇒ giữ nguyên (MISMATCH, như cũ) |
| `GET /refunds/my`, `GET /refunds/:id` | Cho phép **COACH** (hoàn tiền đơn hàng); kèm `order{ code, status, user }`; lọc thêm `orderId`, lý do `ORDER_*` |
| `PATCH /refunds/:id/approve|reject` | Hoàn tiền đơn: không trừ ví HLV; duyệt ⇒ đơn REFUNDED (+ trả hàng về kho nếu chưa giao); từ chối ⇒ đơn quay lại trạng thái trước |
| Job `server.ts` | `expireStaleOrders` ⇒ `runShopMaintenance` (hết hạn thanh toán, quá hạn nhận tại quầy, tự hoàn tất DELIVERED sau 3 ngày) — idempotent, an toàn nhiều instance |

Hạ tầng mới: `src/config/shop.ts` (env `SHOP_*`, có mặc định), `src/middlewares/rateLimit.ts` (không thêm package).

## 11. Ảnh hưởng tới Web

Web **không gọi** API cửa hàng nào (đã kiểm `FE/src`: chỉ `/payments`, `/payments/sepay/*`). Những điểm Web có thể thấy:

| Chỗ | Ảnh hưởng | Web cần làm |
|---|---|---|
| `GET /payments` / `GET /payments/my` của đơn hàng | `orderStatus` trả giá trị enum mới (VD `COMPLETED` thay `SUCCESS`) | Không (Web không hiển thị trạng thái đơn) |
| `Product.stockQuantity` | Nghĩa mới: tồn thực tế (trước: còn bán được) | Nếu Web sau này làm cửa hàng: dùng `availableStock` |
| `GET /refunds` (Manager) | Có thêm bản ghi hoàn tiền đơn hàng: `member` có thể `null`, `class` `null`, có `order` | Web hiện không dùng `/refunds` |
| Báo cáo doanh thu | Hoàn tiền toàn bộ đơn ⇒ Payment `REFUNDED` (giống hủy khóa) — số liệu `refundedAmount` đúng như logic cũ | Không |

## 12. Áp migration `20261011000000_shop_flow` lên Render

1. **Backup:** `pg_dump "$DATABASE_URL" --format=custom --no-owner --file=backup_before_shop_flow.dump`.
2. `cd BE && npx prisma migrate status` — chỉ còn migration chưa áp là `20261010000000_mobile_api_gaps` (nếu chưa áp đợt trước) và `20261011000000_shop_flow`. Áp theo đúng thứ tự (deploy tự làm).
3. Yêu cầu PostgreSQL ≥ 13 (`gen_random_uuid()` dựng sẵn — Render dùng 15/16).
4. Nên áp ngoài giờ cao điểm: migration đổi kiểu cột `Order.status` (khóa bảng `Order` trong thời gian ngắn) và chuyển đổi dữ liệu đơn/tồn kho.
5. `npx prisma migrate deploy` ⇒ `npx prisma generate` ⇒ khởi động BE.
6. Kiểm tra nhanh (chỉ đọc): `SELECT status, count(*) FROM "Order" GROUP BY 1;` (không còn PENDING/SUCCESS), `SELECT id, "stockQuantity", "reservedStock" FROM "Product";` (đơn chờ thanh toán cũ ⇒ `reservedStock` > 0), `GET /api/v1/shop/config`.
7. Hoàn tác: `pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" backup_before_shop_flow.dump` **và** dùng lại code trước đợt này (migration đổi enum + nghĩa `stockQuantity`, code cũ không chạy với DB mới).

Cấu hình tùy chọn trên Render (mặc định đã hợp lý): `SHOP_HOLD_MINUTES`, `SHOP_MAX_PENDING_ORDERS`, `SHOP_PICKUP_DAYS`, `SHOP_SHIPPING_FEE`, `SHOP_FREE_SHIPPING_THRESHOLD`, `SHOP_DELIVERY_PROVINCES`, `SHOP_EXPIRE_LOCK_THRESHOLD`, `SHOP_EXPIRE_LOCK_HOURS`, `SHOP_NOT_PICKED_UP_REFUND_PERCENT`, `SHOP_AUTO_COMPLETE_DAYS`, `SHOP_PICKUP_MAX_ATTEMPTS`, `SHOP_PICKUP_LOCK_MINUTES`, `SHOP_PICKUP_SECRET` (mặc định dùng `JWT_ACCESS_SECRET`).

## 13. Kiểm thử cửa hàng

| Lệnh | Nội dung | Kết quả |
|---|---|---|
| `npm run test:local -- shop` | Giỏ & cảnh báo; xem trước; PRICE_CHANGED; idempotency (replay / khóa dùng lại); PICKUP end-to-end + mã nhận hàng (hash, sai SĐT, dùng lại, khóa sau 5 lần sai); máy trạng thái hợp lệ/không hợp lệ; DELIVERY (khu vực giao, phí ship, miễn phí, vận đơn bắt buộc, khách xác nhận, tự hoàn tất); IDOR (đơn, địa chỉ, dòng đơn); **2 người cùng mua món cuối ⇒ đúng 1 thành công**; job hết hạn nhả hàng + chạy lại idempotent; **webhook về muộn ⇒ không khôi phục, tạo hoàn tiền**; **webhook lệch tiền ⇒ không PAID**; giới hạn đơn chờ / mỗi đơn / mỗi ngày; khóa đặt hàng sau 3 lần hết hạn; quá hạn nhận ⇒ hoàn tiền + trả kho; HLV yêu cầu hoàn tiền (từ chối ⇒ quay lại PAID, duyệt ⇒ REFUNDED + trả kho); Manager hủy; kho (IN/ADJUST/nhật ký/cảnh báo); đánh giá theo dòng + Manager ẩn; API cũ; rate limit | **105/105** |
| `npm run test:smoke:shop:local` (BE đang chạy) | PICKUP (giỏ → checkout → mock-confirm → sẵn sàng → quét QR + 4 số SĐT → đánh giá), DELIVERY (HLV, mua ngay → vận đơn → đã giao → xác nhận → đánh giá), hết hạn ⇒ **job của server** nhả hàng + thông báo | **23/23** |

## 14. File thay đổi (đợt cửa hàng)

- **Mới:** `prisma/migrations/20261011000000_shop_flow/`, `src/config/shop.ts`, `src/middlewares/rateLimit.ts`, `src/modules/shop/{shop.routes,shop.controller,shop.schema,cart.service,address.service,checkout.service,orders.service,order-state,order-view,inventory,pickup-code}.ts`, `tests/shop.e2e.ts`, `tests/smoke-shop.local.ts`.
- **Sửa:** `prisma/schema.prisma`, `src/app.ts`, `src/server.ts`, `src/config/swagger.ts` (tag Shop), `src/types/base-entity.ts`, `src/modules/products/*` (ủy quyền cho shop, field mới), `src/modules/payments/sepay-payments.service.ts` (chốt đơn qua máy trạng thái, tiền về muộn), `src/modules/refunds/{refunds.service,refunds.routes,refunds.schema}.ts`, `src/modules/notifications/notifications.service.ts`, `tests/helpers/{e2e,fixtures}.ts`, `scripts/run-e2e.mjs`, `package.json` (`test:smoke:shop:local`).
- **Package mới:** không có.
