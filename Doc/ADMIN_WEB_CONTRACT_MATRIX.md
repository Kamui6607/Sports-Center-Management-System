# Ma trận contract — Web Manager

> **Cập nhật scope 17/10/2026:** theo `Doc/CLAUDE_MANAGER_WEB_PROMPT.md` mới, các dòng F-02, F-03, F-05, F-07 (thao tác tiền), F-08/F-09 (sửa/thêm endpoint báo cáo), M-01…M-05 (gói thành viên), S-03/S-05/S-07 (điểm danh/chuyển chỗ/chuyên cần), P-07…P-09 (đơn hàng) chuyển **ngoài scope** đợt này. Doanh thu chỉ ĐỌC API hiện có (F-01 read, F-04 read, F-10, F-11). Endpoint "đề xuất" đã triển khai thực tế: `POST/GET /users/:id/password-reset`, `GET /users/:id/history`, `DELETE /users/:id/permanent`, `GET /class-schedules?coachId`. Trạng thái hiện hành theo nhóm ở `Doc/ADMIN_WEB_PROGRESS.md` §2 (bảng dưới giữ bản khảo sát ban đầu).

Commit khảo sát: `acf214d` (nhánh `develop`). Lập từ source thực tế: `BE/src/app.ts` → `*.routes.ts` → controller → Zod → service (không dựa Swagger). Mobile consumer lấy từ `Mobile/lib/features/*/data/*_api_repository.dart` (không tính repository mock).

**Trạng thái:** `TODO` · `IN_PROGRESS` · `IMPLEMENTED` (đã viết code) · `VERIFIED` (đã chạy kiểm tra phù hợp với BE/DB thật, có bằng chứng) · `BLOCKED`. Không đánh VERIFIED chỉ vì đọc code, build hay test mock.

**Phân loại:** `GIỮ` (BE sẵn, FE dùng lại) · `SỬA-FE` (BE sẵn, FE phải viết/sửa) · `BE-BỔ-SUNG` (bổ sung/sửa nhỏ ở BE, ghi rõ) · `NGOÀI` (ngoài phạm vi, không có trên Web demo).

Quy ước guard: `auth` = `authenticate` (kiểm DB: tồn tại, `isActive`, role khớp JWT); `M` = `authorize("MANAGER")`. Lỗi chung: 400 `Validation failed` + `errors[{field,message}]`, 401 thiếu/hết hạn token hoặc tài khoản bị khóa, 403 sai role, 404, 409 xung đột trạng thái. Danh sách trả `{data:[], pagination:{page,limit,total,totalPages}}`, `limit` ≤ 100.

Cột "Bằng chứng" trỏ tới mục trong `Doc/ADMIN_WEB_PROGRESS.md` §6.

## AUTH — Đăng nhập, phiên, định tuyến

| ID | Màn/route FE | Method/path BE | Guard (route → service) | Request → Response/lỗi | Source BE | Mobile consumer | Phân loại | Test nghiệm thu | Trạng thái |
|---|---|---|---|---|---|---|---|---|---|
| AUTH-01 | `/login` → `/manager/dashboard` | `POST /auth/login`, `GET /auth/me` | công khai; `authenticateRestricted` cho `/me` | `{email,password}` → `{accessToken,refreshToken,restricted}`; 401 sai mật khẩu, 403 tài khoản khóa | `auth/auth.service.ts` `login`, `getMe` | `auth_api_repository.dart` (login, me) | SỬA-FE | Login MANAGER thật → dashboard; role đọc từ `/auth/me` | TODO |
| AUTH-02 | Màn "không có quyền" | `GET /auth/me` | — | MEMBER/COACH/role lạ/inactive/`restricted` không vào `/manager/*`, có nút đăng xuất | FE `Session.tsx`, `RoleRouter.tsx` | — | SỬA-FE | Login MEMBER/COACH thật ⇒ thông báo + logout | TODO |
| AUTH-03 | Deep link, F5, hết phiên | `POST /auth/refresh-token`, `POST /auth/logout` | công khai / `authenticateRestricted` | refresh `{refreshToken}` → `{accessToken}`; 401 thu hồi/hết hạn ⇒ về login | `auth.service.ts` `refreshAccessToken`, `logout` | `auth_interceptor.dart` | GIỮ (client `shared/api.ts`) | Mở thẳng `/manager/users` khi đã login/chưa login; xóa access token ⇒ refresh; logout thu hồi | TODO |
| AUTH-04 | — | mọi API Manager | 401 guest, 403 MEMBER/COACH | — | middlewares | — | GIỮ | Probe HTTP trực tiếp guest/MEMBER/COACH trên từng nhóm API Manager | TODO |
| AUTH-05 | `/` khi chưa login | — | — | `/` ⇒ `/login`; landing/register/member/coach/reception ra khỏi luồng | FE `Session.tsx` | — | SỬA-FE | Mở `/` chưa login ⇒ form login | TODO |
| AUTH-06 | `/manager/profile` | `GET/PATCH /auth/me`, `PATCH /auth/me/change-password` | `authenticateRestricted` | đổi mật khẩu thu hồi refresh token | `auth.service.ts` | `auth_api_repository.dart` (change-password) | GIỮ | Sửa hồ sơ, đổi mật khẩu thật | TODO |

## U — Người dùng

| ID | Màn/route FE | Method/path BE | Guard (route → service) | Request → Response/lỗi | Source BE | Mobile consumer | Phân loại | Test nghiệm thu | Trạng thái |
|---|---|---|---|---|---|---|---|---|---|
| U-01 | `/manager/users` | `GET /users?page&limit&role&isActive&search` | auth+M (router.use) | role ∈ MEMBER/COACH/MANAGER (STAFF ⇒ 400); search fullName/email | `users.service.ts` `listUsers` | — | SỬA-FE | Lọc role/trạng thái/tìm, phân trang, giữ filter khi quay lại | TODO |
| U-02 | Chi tiết người dùng | `GET /users/:id` | auth+M | user + memberProfile/coachProfile(+cvUrl, approvalStatus)/managerProfile; không trả password | `getUserById` | — | SỬA-FE | 404 id lạ | TODO |
| U-03 | Tạo tài khoản | `POST /users` | auth+M | `{email,password≥6,fullName≥2,phone?,gender?,dateOfBirth?,role,fitnessGoal?,trainingLevel?,trainingPreference?}` → 201; 409 trùng email/phone (P2002) | `createUser` (transaction user+profile) | — | SỬA-FE | Tạo 3 role; trùng email ⇒ lỗi field; reload thấy dữ liệu | TODO |
| U-04 | Sửa thông tin | `PATCH /users/:id` (fullName/phone/gender/dateOfBirth); `PATCH /members/:id` (fitnessGoal/trainingLevel/trainingPreference) | auth+M | 400/404/409 | `updateUser`, `members.service.ts` `updateMember` | — | SỬA-FE | Sửa rồi reload/đọc DB | TODO |
| U-05 | Đổi vai trò | `PATCH /users/:id {role}` | auth+M → chặn tự đổi, Manager cuối; MEMBER còn BOOKED; COACH còn lịch tương lai | 400 kèm thông điệp | `updateUser` | — | BE-BỔ-SUNG: (a) đếm Manager cuối chống race (advisory lock), (b) COACH còn ví/rút chờ/hoàn chờ/khóa đang mở ⇒ chặn, (c) đổi sang COACH không tự bỏ qua CV | Tự hạ quyền, Manager cuối (song song), Coach có nghĩa vụ | TODO |
| U-06 | Khóa tài khoản | `DELETE /users/:id` (khóa mềm `isActive=false`) | auth+M → chặn tự khóa, Manager cuối | 200 bản ghi đã khóa; ngắt socket | `deactivateUser` | — | BE-BỔ-SUNG (race Manager cuối); FE ghi nhãn "Khóa", không "Xóa" | Tự khóa, Manager cuối song song; token cũ ⇒ 401 | TODO |
| U-07 | Mở khóa | `PATCH /users/:id {isActive:true}` | auth+M | — | `updateUser` | — | BE-BỔ-SUNG: COACH có CV chưa APPROVED ⇒ 409, phải duyệt CV | Mở khóa Coach chờ CV bị chặn; Coach đã duyệt mở được | TODO |
| U-08 | Gửi yêu cầu đặt lại mật khẩu | **đề xuất** `POST /users/:id/password-reset` | auth+M, rate limit theo Manager + cooldown 60s theo user | → `{queued:true, channel:"EMAIL", expiresInSeconds}`; không trả mật khẩu/OTP/token | mới, tái dùng `PasswordResetOtp` + outbox email | Mobile: màn quên/đặt lại mật khẩu bằng OTP (`/auth/reset-password {email,otp,newPassword}`) | BE-BỔ-SUNG | Gọi 2 lần < 60s; OTP hết hạn/dùng lại; email nằm trong outbox (không gửi thật) | TODO |
| U-09 | — | `authenticate` + `PATCH /auth/reset-password` | — | sau khi user tự đặt mật khẩu: refresh token bị xóa (có sẵn) **và** access token cũ bị từ chối | `auth.service.ts` `finishPasswordReset`, `middlewares/authenticate*.ts` | Mobile interceptor nhận 401 ⇒ refresh thất bại ⇒ đăng xuất | BE-BỔ-SUNG: `User.passwordChangedAt` + so `iat` | Access token cũ ⇒ 401 sau reset | TODO |

## H — Huấn luyện viên & CV

| ID | Màn/route FE | Method/path BE | Guard | Request → Response/lỗi | Source BE | Mobile consumer | Phân loại | Test | Trạng thái |
|---|---|---|---|---|---|---|---|---|---|
| H-01 | `/manager/coaches` | `GET /users?role=COACH` (cả bị khóa) ; `GET /coaches` (chỉ active) | auth+M / auth | — | `users.service`, `coaches.service.ts` `listCoaches` | — | SỬA-FE | Danh sách kèm trạng thái CV | TODO |
| H-02 | Chi tiết HLV | `GET /coaches/:id` (userId) ; `GET /coaches/:id/upcoming-sessions` ; `GET /classes?coachId=<profileId>` | auth | 404 không phải COACH | `getCoachById`, `getCoachUpcomingSessions` | — | SỬA-FE | Xem khóa/buổi phụ trách | TODO |
| H-03 | Sửa hồ sơ HLV | `PATCH /coaches/:id` | auth + MANAGER/COACH (COACH chỉ của mình) | `{fullName?,phone?,gender?,dateOfBirth?,specialization?,experienceYears?,bio?}` | `updateCoach` | — | SỬA-FE | Sửa + reload | TODO |
| H-04 | Hàng chờ CV | `GET /coaches/cv/pending?status=PENDING|APPROVED|REJECTED&page&limit` | auth+M | coachProfile + certification + user | `listPendingCoachCVs` | `manager_api_repository.dart` | SỬA-FE (+ BE: validate query `status`, hiện status lạ ⇒ 500) | Lọc 3 trạng thái | TODO |
| H-05 | Xem/tải CV | `GET /coaches/:profileId/cv/file` | `authenticateRestricted`; service: MANAGER hoặc chính HLV; chặn path traversal | PDF `inline`; 403/404 | `coach-students.service.ts` `getCvFile` | `cvFile()` | SỬA-FE (fetch có Bearer → blob, không URL công khai) | MEMBER/COACH khác ⇒ 403; guest ⇒ 401 | TODO |
| H-06 | Duyệt/từ chối CV | `PATCH /coaches/:profileId/cv/review {action,reason?}` | auth+M; CAS `status=PENDING` | APPROVE ⇒ `User.isActive=true`; lần 2 ⇒ 400/409 | `reviewCoachCV` | `reviewCv()` | SỬA-FE | Duyệt, từ chối có lý do, bấm lặp | TODO |
| H-07 | Giao dịch ví HLV | `GET /coaches/wallet/transactions?type&status&coachId(profileId)` | auth+M | mặc định `type=WITHDRAWAL`; kèm số dư/tạm giữ | `coach-wallet.service.ts` `listWalletTransactionsForManager` | `withdrawals()` | SỬA-FE (+ BE validate `page/limit` đã có trong Zod) | Lọc DEPOSIT/REFUND_DEBIT/WITHDRAWAL theo HLV | TODO |

## R — Phòng tập

| ID | Màn/route FE | Method/path BE | Guard | Request → Response/lỗi | Source BE | Mobile consumer | Phân loại | Test | Trạng thái |
|---|---|---|---|---|---|---|---|---|---|
| R-01 | `/manager/rooms` | `GET /rooms?search&areaType&isActive&page&limit` | auth | — | `rooms.service.ts` `listRooms` | `catalog_api_repository.dart`, `course_api_repository.dart` (isActive+areaType) | SỬA-FE | Lọc/phân trang | TODO |
| R-02 | Chi tiết + lịch phòng | `GET /rooms/:id`, `GET /class-schedules?roomId&from&to` | auth | — | `getRoomById`, `listSchedules` | — | SỬA-FE | Lịch theo tuần của phòng | TODO |
| R-03 | Tạo phòng | `POST /rooms {name≥2,capacity>0,location?,areaType}` | auth+M | 409 trùng tên | `createRoom` | — | SỬA-FE | Trùng tên ⇒ lỗi | TODO |
| R-04 | Sửa phòng | `PATCH /rooms/:id` | auth+M; chặn giảm capacity dưới chỗ đã giữ/sức chứa lớp; chặn đổi areaType khi lịch tương lai lệch | 400 `ROOM_CAPACITY_TOO_SMALL` | `updateRoom` | — | SỬA-FE | Capacity/areaType bị chặn | TODO |
| R-05 | Ngừng dùng / mở lại | `DELETE /rooms/:id` (khóa mềm) ; `PATCH /rooms/:id {isActive:true}` | auth+M; chặn khi còn lịch tương lai | 400 | `deleteRoom`, `updateRoom` | — | SỬA-FE | Phòng có lịch ⇒ phải chuyển lịch trước | TODO |
| R-06 | Chuyển lịch phòng | `POST /rooms/:roomId/transfer-schedules/preview` ; `POST /rooms/:roomId/transfer-schedules` `{targetRoomId,from?,to?,reason?}` | auth+M; all-or-nothing, lock phòng đích + HLV | preview `{canTransfer,conflicts[]}`; commit lỗi ⇒ rollback toàn bộ | `previewTransferSchedules`, `transferSchedules` | — | SỬA-FE | Có xung đột ⇒ không cập nhật nửa vời | TODO |

## C — Khóa học (Class)

| ID | Màn/route FE | Method/path BE | Guard | Request → Response/lỗi | Source BE | Mobile consumer | Phân loại | Test | Trạng thái |
|---|---|---|---|---|---|---|---|---|---|
| C-01 | `/manager/classes` | `GET /classes?search&fitness&classType&areaType&isActive&coachId&status&page&limit`; `GET /classes/fitness` | optionalAuthenticate | Manager thấy mọi status; kèm `summary` | `classes.service.ts` `listClasses`, `class-summary.service.ts` | `manager_api_repository.dart` (`status=PENDING`), catalog | SỬA-FE (bỏ sports/multi-coach) | Lọc status/Coach/fitness | TODO |
| C-02 | Chi tiết khóa | `GET /classes/:id`, `GET /classes/:id/course-plan`, `GET /classes/:id/students`, `GET /class-schedules?classId` | optional / auth+(M|COACH) | students: doanh thu gross/coach | `getClassById`, `getClassCoursePlan`, `listClassStudents` | `classDetail()` | SỬA-FE | Xem lộ trình, học viên | TODO |
| C-03 | Duyệt/từ chối | `PATCH /classes/:id/review {action,reason?}` | auth+M; chỉ khi `PENDING` | lần 2 ⇒ 400 | `reviewClass` | `reviewClass()` | BE-BỔ-SUNG (CAS chống duyệt song song) + SỬA-FE | Duyệt; từ chối lý do; bấm lặp | TODO |
| C-04 | Sửa khóa | `PATCH /classes/:id {name?,description?,goal?,fitness?,capacity?,classType?,areaType?,isActive?,price?}` | auth+M; chặn capacity < chỗ giữ, areaType lệch phòng | đổi giá không đổi Payment snapshot | `updateClass` | — | SỬA-FE | Capacity/areaType bị chặn | TODO |
| C-05 | Ngừng/mở lại | `DELETE /classes/:id` (khóa mềm) ; `PATCH {isActive:true}` | auth+M; chặn khi còn buổi tương lai | 400 | `deleteClass` | — | SỬA-FE | | TODO |
| C-06 | (không có nút) | `POST /classes`, `POST /class-schedules/activity-plan`, `POST /classes/:id/coaches*` | COACH only / không mount | Manager ⇒ 403 / 404 | — | Coach Mobile tạo khóa | NGOÀI | Probe 403 | TODO |

## S — Lịch học, đặt chỗ, điểm danh

| ID | Màn/route FE | Method/path BE | Guard | Request → Response/lỗi | Source BE | Mobile consumer | Phân loại | Test | Trạng thái |
|---|---|---|---|---|---|---|---|---|---|
| S-01 | `/manager/schedules` (lịch tuần/tháng + bảng) | `GET /class-schedules?classId&roomId&status&from&to&page&limit` (+ **đề xuất** `coachId`) | auth | overlap `[from,to)`; `class` + `room` + `_count.enrollments` | `class-schedules.service.ts` `listSchedules` | `schedule_api_repository.dart`, `manager classDetail` | SỬA-FE + BE-BỔ-SUNG (lọc `coachId`, kèm tên HLV trong `class.coach`) | Lọc Coach/phòng/khóa/trạng thái, múi giờ VN | TODO |
| S-02 | Chi tiết buổi | `GET /class-schedules/:id`, `GET /enrollments/schedule/:scheduleId` | auth / auth+(M|COACH) | buổi bù (`makeupForId`), hủy (`cancelReason`,`cancelResolution`) | `getScheduleById`, `enrollments.service.ts` `getScheduleEnrollments` | `schedule_api_repository.dart` | SỬA-FE | Hiển thị buổi chính/bù/hủy/hoàn thành | TODO |
| S-03 | Điểm danh buổi | `GET /attendance?scheduleId`, `PUT /attendance/schedule/:scheduleId {items[]}` | auth + COACH/MANAGER | Manager được ghi (kể cả EXCUSED) | `attendance.service.ts` | Coach Mobile | SỬA-FE | Lưu rồi đọc lại | TODO |
| S-04 | (không có nút) | `POST/PATCH/DELETE /class-schedules*`, `/cancel`, `/complete` | COACH (route) + `assertCanManageClassSchedule` (service) | Manager ⇒ 403 | — | Coach Mobile | NGOÀI (D2) | Probe 403 | TODO |
| S-05 | Chuyển buổi cho học viên | `GET /enrollments/:id/transfer-options`, `POST /enrollments/:id/transfer {targetScheduleId}` | auth; MEMBER chủ chỗ hoặc MANAGER (không giới hạn 24h) | lock memberQuota→memberClass→schedule | `transferEnrollment`, `getTransferOptions` | Member Mobile | SỬA-FE | Chuyển chỗ rồi đọc lại danh sách | TODO |
| S-06 | (không có nút) | `POST /enrollments`, `POST /enrollments/bulk` với `memberId` | auth; MANAGER được đặt hộ | **bỏ qua thanh toán** khóa trả phí | `enrollments.controller.ts` | — | NGOÀI (không đưa lên Web: ghi danh không qua thanh toán) | — | TODO |
| S-07 | `/manager/attendance` | `GET /reports/attendance?status&classId&memberId`, `POST /attendance/warnings/scan`, `GET /attendance/penalties`, `POST /attendance/penalties/preview|apply`, `POST /attendance/penalties/:id/revoke` | auth+M | apply `{memberId,classId,reason?}`; revoke `{reason?,restoreSlots?}` | `reports.service.ts` `getAttendanceReport`, `attendance-penalties.service.ts` | Member Mobile (appeal) | SỬA-FE | Áp dụng/gỡ phạt rồi đọc lại | TODO |

## P — Cửa hàng

| ID | Màn/route FE | Method/path BE | Guard | Request → Response/lỗi | Source BE | Mobile consumer | Phân loại | Test | Trạng thái |
|---|---|---|---|---|---|---|---|---|---|
| P-01 | `/manager/products` | `GET /products?search&isActive=true|false|all&page&limit`, `GET /products/:id` | công khai / optional | `availableStock` | `products.service.ts` | `product_api_repository.dart` | SỬA-FE | Lọc trạng thái | TODO |
| P-02 | Tạo sản phẩm | `POST /products {name,description≥5,price,stockQuantity,isActive?,imageUrl?,imageUrls?,maxPerOrder?,maxPerDay?,lowStockThreshold?}` | auth+M | tồn đầu ghi ledger `IN` một lần | `createProduct` | — | SỬA-FE | Tạo + xem lịch sử kho có đúng 1 dòng IN | TODO |
| P-03 | Sửa sản phẩm | `PATCH /products/:id` (không gửi `stockQuantity`) | auth+M | đổi giá không đổi `OrderItem.unitPrice` | `updateProduct` | — | SỬA-FE | Sửa giá; đơn cũ giữ giá | TODO |
| P-04 | Ngừng bán / bán lại | `PATCH /products/:id {isActive}` | auth+M | `DELETE /products/:id` là **xóa cứng** (cascade review/ledger) ⇒ Web không gọi | `deleteProduct` | — | SỬA-FE (dùng PATCH) | Ngừng bán giữ đơn/review | TODO |
| P-05 | Ảnh | `imageUrl`, `imageUrls[]` (URL http/https) | — | BE chưa có upload ảnh sản phẩm | — | — | SỬA-FE (nhập URL) | URL sai ⇒ lỗi field | TODO |
| P-06 | Kho | `GET /shop/manage/inventory?search&lowStock`, `POST /shop/manage/inventory/:productId {type:IN|ADJUST,quantity,note≥3}`, `GET .../:productId/transactions` | auth+M | 409 `STOCK_BELOW_RESERVED` | `shop/orders.service.ts` `listInventory`, `changeInventory`, `listInventoryTransactions` | `shop_api_repository.dart` | SỬA-FE | Nhập/điều chỉnh có lý do, lịch sử | TODO |
| P-07 | Đơn hàng | `GET /shop/manage/summary`, `GET /shop/manage/orders?status&fulfillmentType&search`, `GET /shop/manage/orders/:id` | auth+M | `allowedTransitions[]`, lịch sử trạng thái, hoàn tiền | `managerSummary`, `listOrdersForManager`, `getOrderForManager` | `shop_api_repository.dart` | SỬA-FE | Lọc nhóm/trạng thái | TODO |
| P-08 | Chuyển trạng thái | `POST /shop/manage/orders/:id/status {status,reason?,trackingCode?,carrier?}` | auth+M; `MANAGER_TRANSITIONS`; CAS | 409 `ORDER_INVALID_TRANSITION`/`ORDER_STATE_CHANGED` | `managerTransition` | `shop_api_repository.dart` | SỬA-FE (chỉ hiện `allowedTransitions`) | Chuyển sai ⇒ 409; bấm lặp | TODO |
| P-09 | Nhận hàng tại quầy | `POST /shop/manage/pickup/verify {code}`, `POST /shop/manage/orders/:id/pickup {code,phoneLast4}` | auth+M + rate limit | dùng 1 lần; sai 5 lần ⇒ 423 | `verifyPickupCode`, `confirmPickup` | `shop_api_repository.dart` | SỬA-FE | Xác nhận 2 lần ⇒ 409 `PICKUP_CODE_USED` | TODO |
| P-10 | Đánh giá | `GET /shop/manage/reviews?productId&hidden`, `PATCH /shop/manage/reviews/:id {isHidden,reason?}` | auth+M | tính lại điểm | `listReviewsForManager`, `setReviewVisibility` | `shop_api_repository.dart` | SỬA-FE | Ẩn/hiện | TODO |

## F — Tài chính & báo cáo

| ID | Màn/route FE | Method/path BE | Guard | Request → Response/lỗi | Source BE | Mobile consumer | Phân loại | Test | Trạng thái |
|---|---|---|---|---|---|---|---|---|---|
| F-01 | `/manager/payments` | `GET /payments?memberId&status&method&startDate&endDate&page&limit`, `GET /payments/:id` | auth+M / auth (MEMBER chỉ của mình, COACH 403) | lọc theo `createdAt` | `payments.service.ts` `listPayments`, `getPaymentById` | — | SỬA-FE + BE-BỔ-SUNG (kèm loại: khóa/đơn/gói, tên khóa/mã đơn) | Lọc, xem chi tiết | TODO |
| F-02 | Ghi nhận thủ công | `PATCH /payments/:id/status {status}` | auth+M; giao dịch có `gateway` (SePay) ⇒ 400 | PENDING→SUCCESS cộng ví HLV + ghi danh | `updatePaymentStatus` | — | BE-BỔ-SUNG (CAS + lock: 2 request ⇒ cộng ví 1 lần) + SỬA-FE (chỉ PENDING→SUCCESS/FAILED cho CASH/BANK_TRANSFER; không đổi REFUNDED tay) | Song song ⇒ 1 DEPOSIT | TODO |
| F-03 | Kích hoạt lại | `POST /payments/:id/retry-activation` | auth+M; chỉ SePay `SUCCESS`+`REQUIRES_REVIEW` | 409 `SEPAY_ALREADY_HANDLED` | `sepay-payments.service.ts` `retrySepayActivation` | — | SỬA-FE | Nút chỉ hiện khi REQUIRES_REVIEW | TODO |
| F-04 | `/manager/refunds` | `GET /refunds/summary`, `GET /refunds?status&reason&memberId&orderId&classId`, `GET /refunds/:id` | auth+M | bankInfo + VietQR | `refunds.service.ts` | `refund_api_repository.dart`, `manager_api_repository.dart` (summary) | SỬA-FE | Lọc, chi tiết | TODO |
| F-05 | Duyệt/từ chối hoàn | `PATCH /refunds/:id/approve {note?,transactionRef?}`, `PATCH /refunds/:id/reject {reason≥3}` | auth+M; lock payment; `status=PENDING` | duyệt ⇒ trừ ví HLV theo tỷ lệ; lần 2 ⇒ 409 | `approveRefund`, `rejectRefund` | `refund_api_repository.dart` | BE-BỔ-SUNG (khóa ví HLV dùng chung với duyệt rút) + SỬA-FE ("đã chuyển khoản ngoài hệ thống") | Duyệt lặp; song song với rút | TODO |
| F-06 | `/manager/withdrawals` | `GET /coaches/wallet/transactions?type=WITHDRAWAL&status`, `GET /coaches/wallet/transactions/:txId` | auth+M | kèm `wallet.balance/pendingRefundDebit/available` | `coach-wallet.service.ts` | `manager_api_repository.dart` | SỬA-FE | | TODO |
| F-07 | Duyệt/từ chối rút | `PATCH /coaches/wallet/transactions/:txId/review {action,reason?}` | auth+M | APPROVE trừ ví | `reviewWithdrawal` | `reviewWithdrawal()` | BE-BỔ-SUNG: kiểm trạng thái **trong** transaction + CAS + khóa ví; chặn duyệt khi số dư − tạm giữ hoàn < số rút; lưu người/ thời điểm duyệt | Duyệt song song ⇒ trừ 1 lần | TODO |
| F-08 | `/manager/reports` | `GET /reports/revenue?startDate&endDate` | auth+M | xem định nghĩa ở FLOW_MAP §F | `reports.service.ts` `getRevenueReport` | — (Mobile không gọi) | BE-BỔ-SUNG (sửa bug hoàn tiền qua kỳ, net âm, tách nguồn, phần nền tảng/HLV, chi HLV) | Bộ dữ liệu 9/10/11 + pending/rejected | TODO |
| F-09 | Xuất CSV | **đề xuất** `GET /reports/revenue/ledger?startDate&endDate&page&limit` | auth+M | từng dòng thu/hoàn trong kỳ, cùng định nghĩa F-08 | mới | — | BE-BỔ-SUNG | CSV khớp tổng KPI, đủ mọi trang, chống công thức | TODO |
| F-10 | `/manager/dashboard` | `/reports/*`, `/refunds/summary`, `/shop/manage/summary`, `/coaches/cv/pending`, `/classes?status=PENDING`, `/coaches/wallet/transactions?status=PENDING`, `/class-schedules?from&to` | auth+M | số liệu thật, click mở màn tương ứng | — | — | SỬA-FE | Đối chiếu KPI với danh sách | TODO |
| F-11 | Báo cáo khác | `GET /reports/members|enrollments|memberships` | auth+M | — | `reports.service.ts` | — | SỬA-FE | | TODO |

## M — Gói thành viên

| ID | Màn/route FE | Method/path BE | Guard | Request → Response/lỗi | Source BE | Mobile consumer | Phân loại | Test | Trạng thái |
|---|---|---|---|---|---|---|---|---|---|
| M-01 | `/manager/memberships` (gói) | `GET /membership-plans` (chỉ gói đang bán) + **đề xuất** `?includeInactive=true` (chỉ MANAGER) | auth | Manager cần thấy gói đã tắt để bật lại | `memberships.service.ts` `listPlans` | `membership_api_repository.dart` (`GET /membership-plans` không tham số — giữ nguyên) | BE-BỔ-SUNG + SỬA-FE | Tắt rồi bật lại | TODO |
| M-02 | Tạo gói | `POST /membership-plans {name,durationDays,price≥1000,description?}` | auth+M | không có `tier/maxConcurrentClasses` (snapshot FE cũ sai) | `createPlan` | — | SỬA-FE | | TODO |
| M-03 | Bật/tắt gói | `PATCH /membership-plans/:id/toggle {isActive?}` | auth+M | gói đã mua vẫn giữ | `togglePlan` | — | SỬA-FE | | TODO |
| M-04 | Danh sách hội viên mua gói | `GET /memberships?status&page&limit` | auth+M | | `listMemberships` | — | SỬA-FE | | TODO |
| M-05 | Kiểm tra gói của user | `GET /memberships/verify/:userId` | auth + COACH/MANAGER | | `verifyMembership` | `membership_api_repository.dart` | SỬA-FE (trong chi tiết hội viên) | | TODO |

## G — Khung giao diện và chức năng dùng chung

| ID | Nội dung | Phân loại | Test | Trạng thái |
|---|---|---|---|---|
| G-01 | Sidebar theo tác vụ; gỡ menu STAFF/lễ tân, Bộ môn (`/sports`), Gói cũ (tier), Hóa đơn (`/invoices`), "Tạo lịch nhanh" (Manager tạo khóa), Đăng ký lớp (reception), Vai trò & quyền (placeholder), Nhật ký (placeholder) | SỬA-FE | Không còn link 404/placeholder | TODO |
| G-02 | Thông báo + chat đang mount trong `PortalLayout` vẫn hoạt động (`/notifications*`, `/chat/*`) | GIỮ | Mở chuông thông báo, chat | TODO |
| G-03 | Contract client: snapshot `FE/docs/openapi.json` sinh từ BE local đúng commit; review `workflow-contract-overrides.json` | SỬA-FE | `generate:api` + diff review | TODO |
| G-04 | Responsive 1440/1024/768/375, bàn phím/focus/modal, loading/error/empty/forbidden | SỬA-FE | Playwright với BE thật | TODO |

## X — Ngoài phạm vi đợt này (không đưa lên Web demo)

| Nội dung | Lý do |
|---|---|
| Manager tạo khóa/định giá hộ, đổi Coach/ownership, nhiều Coach | D1/D8; BE chỉ cho COACH (`POST /classes` 403) |
| Manager tạo/sửa/hủy/hoàn thành buổi, dạy bù/hoàn tiền buổi | D2; `class-schedules` mutation chỉ COACH ở route + service |
| Manager ghi danh hộ (`POST /enrollments`, `/enrollments/bulk` với memberId) | BE cho phép nhưng bỏ qua thanh toán — không đưa lên Web |
| Ghi nhận thanh toán tại quầy mới (`POST /payments`) | BE có; chưa đưa vào Web đợt này (luồng mua chính là SePay trên Mobile) |
| Audit log tổng quát, permission động, ADMIN/STAFF | Không có API; không làm màn placeholder |
| Sports, invoices, subscriptions, tier, multi-coach | Đã bỏ ở BE (migration `drop_sport`, `drop_invoice`, `one_coach_per_class`) |
| Upload ảnh sản phẩm | BE chỉ nhận URL |
