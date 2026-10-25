# 🏋️ Đợt điều chỉnh 19/10/2026 — Thu hẹp phạm vi GYM & hoàn thiện nghiệp vụ

> **Phạm vi:** `BE/`, `Mobile/`, `FE/`. Không commit / push. Migration mới chỉ áp lên DB local (Docker `scms_pg_local`), **chưa** áp Render.
>
> **Định hướng sản phẩm:** hệ thống chỉ phục vụ bộ môn **Gym**.
> - **Member & Coach dùng Mobile** (Flutter).
> - **Manager dùng Web** (FE) cho mọi chức năng quản lý. Tài khoản Manager đăng nhập Mobile sẽ được hướng sang Web.
> - **Bỏ tài khoản Staff (lễ tân)** — chỉ còn 3 vai trò: MEMBER, COACH, MANAGER.

---

## 1. Thu hẹp phạm vi Gym

| Hạng mục | Trước | Sau |
|---|---|---|
| Bộ môn (`Class.fitness`) | Coach nhập tự do (Yoga, Bơi, HIIT…) | Cố định `"Gym"` (cột giữ để tương thích dữ liệu cũ); Mobile bỏ ô chọn bộ môn |
| Khu vực (`areaType`) | POOL / INDOOR / OUTDOOR | Khóa/phòng mới mặc định `INDOOR`; UI không hỏi khu vực |
| Phân loại khóa | theo bộ môn | theo **mục tiêu tập luyện** (danh mục chung — mục 9) |

## 2. Tiếng Việt

1. **BE trả thông điệp tiếng Việt:** lớp dịch tập trung `src/utils/i18n.ts` dịch mọi thông điệp lỗi tiếng Anh cũ (≈140 câu + mẫu có tham số) ngay trong `errorHandler` → Web/Mobile luôn nhận tiếng Việt.
2. **Lỗi validate (Zod) tiếng Việt:** error map toàn cục (`Tối thiểu 2 ký tự`, `Bắt buộc nhập`…).
3. **Chuẩn hoá Unicode NFC** cho mọi chuỗi trong body request (middleware `normalizeUnicode`) — tránh lỗi chữ có dấu bị tách (NFD) khi gõ bằng một số bộ gõ (Unikey/macOS), giúp tìm kiếm & hiển thị nhất quán.
4. **Tìm kiếm không dấu:** tìm khóa học theo tên chấp nhận gõ không dấu (`giam mo` khớp `Giảm mỡ`).

## 3. Sổ địa chỉ giao hàng (Mobile)

- Địa giới hành chính **mới nhất (hiệu lực từ 01/07/2025): 2 cấp** — *Tỉnh/Thành phố → Phường/Xã* (34 tỉnh/thành, **không còn cấp Quận/Huyện**). Dữ liệu lấy từ `GET /locations/provinces` và `GET /locations/provinces/:code/wards` (nguồn provinces.open-api.vn bản v2, BE cache 24h).
- Form địa chỉ dùng **dropdown có ô tìm kiếm**: chọn Tỉnh ⇒ tải danh sách Phường/Xã tương ứng; đổi Tỉnh ⇒ xóa Phường/Xã đã chọn. Tỉnh ngoài khu vực giao được đánh dấu.
- Lưu thêm `provinceCode`, `wardCode` để mở lại form sửa đúng mục đã chọn.
- **CRUD đầy đủ, nhiều địa chỉ** (tối đa 10): thêm / sửa / xóa / đặt mặc định; xóa địa chỉ mặc định ⇒ địa chỉ mới nhất còn lại thành mặc định.

## 4. Chi tiết khóa học (Mobile)

- **Bấm vào HLV** ⇒ bảng thông tin đầy đủ (`GET /coaches/:id/profile`, công khai đã ẩn email/SĐT): ảnh, tên, chuyên môn, số năm kinh nghiệm, giới thiệu, điểm đánh giá + phân bố sao, số học viên / khóa đã dạy, các khóa đang mở bán, đánh giá gần đây.
- **Bấm vào "Buổi sắp diễn ra"** ⇒ danh sách đầy đủ các buổi (thứ, ngày, giờ, phòng, vị trí phòng, buổi dạy bù / đã dời lịch).
- Hiển thị **Mục tiêu khóa học**, **trình độ phù hợp**, **ngày khai giảng – ngày kết thúc**, **địa điểm tập** và **mức độ phù hợp với mục tiêu của tôi**.

## 5. Lịch sử khóa học & khối "đang hoạt động"

- `GET /enrollments/my/courses` (đã có) trả mỗi khóa 1 dòng với trạng thái: `PENDING_PAYMENT` · `UPCOMING` · `ONGOING` · `COMPLETED` · `CANCELLED` · `PAID_NOT_ENROLLED`.
- **Góc trên màn Khóa học** có nút "Khóa của tôi" kèm số khóa đang hoạt động (đang chờ thanh toán / sắp khai giảng / đang diễn ra) ⇒ mở danh sách nhanh; khóa đang chờ thanh toán có nút **Tiếp tục thanh toán** và đồng hồ hết hạn.
- **Lịch sử khóa học**: tab *Đang hoạt động* · *Đã hoàn thành* · *Đã hủy*.

## 6. Hóa đơn & doanh thu không đổi khi giá / thông tin thay đổi

- Mỗi giao dịch lưu **ảnh chụp tại thời điểm mua** `Payment.purchaseSnapshot` (khóa học: tên, giá, hạng, HLV, số buổi, ngày khai giảng/kết thúc, mục tiêu; gói thành viên: tên gói, số ngày, giá). Số tiền luôn là `Payment.amount`.
- Đơn hàng vốn đã snapshot từng dòng (`OrderItem.productName/unitPrice/totalAmount`).
- Lịch sử khóa học, hóa đơn, thống kê doanh thu (top khóa, doanh thu theo khóa/gói) **đọc snapshot + `amount`**, không đọc giá/tên hiện tại. Đổi giá khóa/sản phẩm/gói chỉ áp dụng cho giao dịch **mới**.

## 7. Đánh giá khóa học (1 lần + sửa 1 lần)

- Chỉ đánh giá khi **đã học xong khóa** (đã thanh toán, có giữ chỗ, mọi buổi chưa hủy đã kết thúc) — bắt buộc gắn `classId`.
- Mỗi (học viên × khóa) **đánh giá 1 lần** và **được sửa lại đúng 1 lần** (`CoachFeedback.editCount`). Sửa lần 2 ⇒ `409 FEEDBACK_EDIT_LIMIT`.
- Học viên **không được xóa** đánh giá (tránh xóa rồi đánh giá lại vô hạn); Manager vẫn xóa được đánh giá vi phạm.
- `my/courses` trả `canReview`, `canEditReview`, `myRating`.

## 8. Đổi buổi học (Member)

Mỗi học viên mua khóa đã được ghi danh vào **mọi buổi** của khóa ⇒ "đổi buổi" nghĩa là *bỏ buổi X để học bù ở một buổi khác*:

1. Buổi đích phải là: buổi **dạy bù** của chính khóa đó (mà học viên chưa có chỗ) **hoặc** buổi của một **khóa tương đương** — cùng HLV, cùng hạng (REGULAR/PREMIUM), đang mở bán. *Cùng HLV* để tiền 85% đã cộng cho HLV vẫn đúng người dạy.
2. Chỉ đổi khi **cả buổi hiện tại và buổi đích còn ≥ 24 giờ** mới bắt đầu.
3. Buổi đích còn chỗ, không trùng giờ lịch khác của học viên, học viên chưa bị phạt chuyên cần ở khóa đó.
4. **Tối đa 2 lần đổi mỗi khóa** (đếm theo khóa đã mua).
5. Không hoàn tiền khi đổi (đổi ≠ hủy). Chỗ cũ chuyển `CANCELLED`, chỗ mới ghi `sourceClassId` (khóa đã trả tiền) + `transferredFromId`.
6. `GET /enrollments/:id/transfer-options` trả danh sách buổi đích (kèm khóa, phòng, chỗ trống, xung đột) + `transfersUsed/transfersLeft`.

## 9. Mục tiêu khóa học & gợi ý mục tiêu cho học viên

- Danh mục mục tiêu chung `GET /classes/goal-options`: Giảm mỡ/giảm cân · Tăng cơ · Tăng sức mạnh · Tăng sức bền · Săn chắc vóc dáng · Linh hoạt & tư thế · Phục hồi chấn thương · Sức khỏe tổng quát · Làm quen phòng gym · Chuẩn bị thi đấu thể hình.
- Coach chọn **mục tiêu khóa** (`Class.goalTags`, 1–4 mục), **trình độ phù hợp** (`Class.targetLevel`, tùy chọn) và mô tả chi tiết (`Class.goal`).
- Member chọn **mục tiêu của tôi** từ gợi ý (`MemberProfile.fitnessGoals`, tối đa 5) + ghi chú tự do (`fitnessGoal`).
- **Độ phù hợp** (`goalMatch`): điểm = 80% × (số mục tiêu trùng / số mục tiêu của học viên) + 20% nếu trình độ khớp (hoặc khóa không giới hạn trình độ). ≥ 60 ⇒ *Rất phù hợp*, ≥ 30 ⇒ *Khá phù hợp*, > 0 ⇒ *Ít phù hợp*, 0 ⇒ *Chưa phù hợp*; chưa khai báo mục tiêu ⇒ *Chưa xác định*. Màn khám phá có bộ lọc **"Phù hợp với tôi"** (`matchMyGoals=true`).

## 10. Coach tạo khóa học

### 10.1. Ngày kết thúc tự tính
- Wizard tự sinh danh sách buổi ngay khi đổi *ngày bắt đầu / các thứ / giờ / số buổi* và hiển thị **Ngày kết thúc dự kiến** = ngày của buổi thứ N.
- BE lưu `Class.startDate` / `Class.endDate` (tính từ lịch khi gửi duyệt) và **cập nhật lại** khi buổi bị dời lịch, hủy hoặc thêm buổi bù.

### 10.2. Bản nháp
- Thêm trạng thái `DRAFT`. Khóa nháp **không giữ phòng, không tạo buổi**, chỉ chủ khóa thấy.
- Wizard **tự lưu** lên server (`POST /classes/drafts`, `PATCH /classes/drafts/:id`) sau mỗi thay đổi (debounce ~1,5s), khi chuyển bước và khi app chuyển nền/thoát màn. Toàn bộ trạng thái wizard nằm trong `Class.draftData`.
- Danh sách khóa của Coach hiển thị thẻ **Nháp** ⇒ *Tiếp tục tạo* / *Xóa nháp*. Gửi duyệt: `POST /classes/drafts/:id/submit` (kiểm tra đầy đủ + giữ phòng + tạo buổi ⇒ `PENDING`).
- Manager không thấy khóa nháp; Member/Guest chỉ thấy khóa `APPROVED`.

## 11. Hủy khóa & hoàn tiền (Member)

| Thời điểm hủy | Kết quả |
|---|---|
| Còn **≥ 3 ngày (72h)** trước buổi khai giảng | Yêu cầu hoàn **100%** (Manager chuyển khoản tay rồi duyệt). Chỗ giữ tới khi duyệt. |
| **< 3 ngày** / khóa đã khai giảng — *Hủy không hoàn* | Hủy ngay mọi buổi sắp tới, không hoàn tiền. |
| **< 3 ngày** — *Gửi yêu cầu hoàn tiền ngoại lệ* | Hủy ngay mọi buổi sắp tới + tạo yêu cầu `MEMBER_CANCEL_COURSE_LATE`. **Giá trị gốc** = tiền đã trả × (số buổi chính chưa diễn ra / tổng buổi chính). Manager duyệt kèm **phí chiết khấu** (mặc định **30%**, `LATE_CANCEL_FEE_PERCENT`, Manager chỉnh 0–100%) ⇒ hoàn = giá trị gốc × (100% − phí). Từ chối ⇒ không hoàn (khóa vẫn đã hủy). |

**Hủy một buổi lẻ:** trước giờ học **≥ 24h** ⇒ hoàn **80%** tiền của buổi (= tiền khóa ÷ số buổi chính × 80%); muộn hơn ⇒ hủy được nhưng không hoàn. Buổi **bị HLV dời lịch** ⇒ học viên hủy buổi đó trước giờ học mới được hoàn **100%** tiền buổi (`SESSION_RESCHEDULED`).

## 12. Coach dời buổi học sang ngày khác

`POST /class-schedules/:id/reschedule { startTime, endTime, roomId?, reason }` — chỉ HLV phụ trách:

1. Chỉ buổi `SCHEDULED` của khóa `APPROVED`; buổi hiện tại còn **≥ 24h** mới bắt đầu (gấp hơn ⇒ dùng *Hủy buổi* với dạy bù / hoàn tiền).
2. Giờ mới phải cách hiện tại **≥ 24h** (để học viên kịp sắp xếp); bắt buộc nhập lý do.
3. Mỗi buổi dời **tối đa 2 lần**; lưu `originalStartTime`, `rescheduleCount`, `rescheduleReason`, `rescheduledAt`.
4. Kiểm tra trùng phòng / trùng lịch dạy của HLV (chặn). Học viên bị trùng lịch cá nhân **không chặn** việc dời mà được cảnh báo riêng.
5. Mọi học viên đã giữ chỗ nhận thông báo (giờ cũ → giờ mới, phòng, lý do). Học viên không đi được có thể **hủy buổi đó và được hoàn 100%** hoặc **đổi buổi** (mục 8).
6. `PATCH /class-schedules/:id` đổi giờ dùng chung luật trên. Ngày khai giảng/kết thúc khóa tự cập nhật.

## 13. Địa điểm phòng tập

- **Thông tin trung tâm** (`CenterSetting`, 1 bản ghi): tên, địa chỉ, link bản đồ, hotline, email, giờ mở cửa, ghi chú gửi xe. `GET /center` (công khai) · `PUT /center` (Manager, trang *Cài đặt trung tâm* trên Web).
- **Phòng tập** thêm `floor` (tầng) và `directions` (chỉ dẫn), cùng `location` (khu vực) sẵn có.
- Mobile hiển thị **Địa điểm tập** ở chi tiết khóa, chi tiết buổi (Member & Coach): phòng · tầng · khu vực · chỉ dẫn + địa chỉ trung tâm, nút **Mở bản đồ** / **Sao chép địa chỉ**. Màn **Thông tin trung tâm** trong tab Tài khoản.

## 14. Bỏ tài khoản Staff

- FE: xóa không gian *Lễ tân* (`/receptionist`, `features/reception`), vai trò `STAFF` khỏi router/nhãn/kiểu dữ liệu.
- BE: bỏ tài khoản seed `staff@sportscenter.com`, các nhánh quyền `STAFF` và mô tả Swagger liên quan.
- Mobile: bỏ chữ "staff" ở luồng quét thẻ thành viên.

## 15. Web Manager bổ sung (thay phần Manager trên Mobile)

- **Hoàn tiền**: danh sách theo trạng thái/lý do, chi tiết, duyệt (kèm mã giao dịch, **phí chiết khấu** với yêu cầu ngoại lệ) / từ chối.
- **Rút tiền HLV**: danh sách lệnh rút, duyệt / từ chối.
- **Đơn hàng**: danh sách, chi tiết, chuyển trạng thái, xác nhận nhận hàng bằng mã.
- **Cài đặt trung tâm**; Phòng tập thêm tầng / chỉ dẫn.

---

## 16. Migration & áp lên DB Render

- Migration mới: `BE/prisma/migrations/20261019000000_gym_scope/migration.sql` — viết **idempotent** (`IF NOT EXISTS`), gồm cả 3 cột ngân hàng của `Refund` mà commit `6213df2` thêm vào schema nhưng chưa có migration; backfill `Class.startDate/endDate` từ lịch và `Payment.purchaseSnapshot` tối thiểu cho giao dịch khóa học cũ; tạo bản ghi `CenterSetting` mặc định.
- **Đã áp trên DB local** (`npm run db:migrate:local`, cùng 4 migration 13–14/10 còn treo). **Chưa áp Render.** Khi áp:
  1. Sao lưu: `pg_dump "$RENDER_DATABASE_URL" -Fc -f backup_$(date +%Y%m%d).dump`
  2. `cd BE && npx prisma migrate deploy` (với `DATABASE_URL` của Render).
  3. Vào Web › **Cài đặt trung tâm** nhập địa chỉ thật; vào **Phòng tập** bổ sung tầng/khu vực/chỉ dẫn.
- Biến môi trường mới (tùy chọn): `LATE_CANCEL_FEE_PERCENT` (mặc định 30).

## 17. Kiểm thử

| Phạm vi | Lệnh | Kết quả |
|---|---|---|
| BE type-check | `cd BE && npx tsc --noEmit` | sạch |
| BE luồng mới (DB local) | `npm run dev:local` + `npm run test:gym:local` | **40/40 pass** (tiếng Việt, NFC, trung tâm, mục tiêu, nháp → duyệt, ngày kết thúc, độ phù hợp, hồ sơ HLV, dời lịch, snapshot giá/tên, đổi buổi khóa tương đương, hủy buổi bị dời hoàn 100%, hoàn ngoại lệ + phí, đánh giá 1 lần + sửa 1 lần) |
| BE e2e cũ | `npm run test:local` | auth-security 46/46 · wallet-attendance 35/35 · shop 105/105 · admin-web 87/87 · mobile-api 48/55 (7 case **lỗi sẵn từ trước** — test viết 10/10, trước khi luật hủy 3 ngày/đánh giá khi học xong được đổi ở commit `f10d80a`) |
| Mobile | `flutter analyze` · `flutter test --exclude-tags live` | sạch · **113/113 pass** (screen sweep thêm màn Lịch sử khóa học, Thông tin trung tâm, chi tiết khóa, Dời lịch) |
| FE | `npx tsc --noEmit` · `npx vitest run` | sạch · 43/43 pass. `npm run typecheck` (strict unused) còn 1 lỗi **có sẵn** ở `CoachDetailPage.tsx` |
| FE thủ công | Trình duyệt với BE local | Hoàn tiền (dialog duyệt), Đơn hàng, Rút tiền HLV, Cài đặt trung tâm, Phòng tập, Khóa học — không lỗi console |

## 18. Ghi chú / giới hạn

- **Manager trên Mobile:** chặn đăng nhập khi chạy API thật (thông báo dùng Web). Chế độ mock (`USE_MOCK=true`) vẫn vào màn Manager rút gọn để demo/test giao diện; mã màn Manager Mobile giữ nguyên.
- **Mock Mobile:** các luồng mới (nháp server, dời lịch, hoàn ngoại lệ, địa danh) có bản mock rút gọn — đầy đủ khi chạy API thật.
- **Web phần Member/Coach cũ** (`FE/src/pages/member`, `features/coach`) không còn là kênh chính (Member/Coach dùng Mobile) — chỉ sửa để biên dịch được; các Playwright spec cũ (`FE/tests/browser`) vốn đã lệch giao diện hiện tại, chỉ gỡ phần Staff.
- **Địa chỉ:** theo địa giới mới 2 cấp nên không còn dropdown Quận/Huyện; địa chỉ cũ có Quận/Huyện được giữ nguyên khi sửa (nếu không đổi Tỉnh).

## 19. File chính

- **BE:** `src/config/fitness-goals.ts`, `src/utils/i18n.ts`, `src/modules/center/*`, `src/modules/payments/purchase-snapshot.ts`, `tests/gym-scope.local.ts`; sửa `classes`, `class-schedules`, `enrollments`, `refunds`, `feedbacks`, `coaches`, `reports`, `rooms`, `auth`, `members`, `shop`, `payments`, `memberships`, `prisma/schema.prisma`, `prisma/seed.ts`.
- **Mobile:** `features/catalog/presentation/{location_card,goal_chips_field,center_info_screen}.dart`, `classes/presentation/widgets/coach_profile_sheet.dart`, `schedule/presentation/screens/reschedule_session_screen.dart`, `core/widgets/search_select_field.dart`, `core/utils/vn_text.dart`; viết lại wizard tạo khóa, Khóa học của tôi (lịch sử), form địa chỉ, hủy khóa, chi tiết buổi; thêm `url_launcher`.
- **FE:** `features/manage/pages/{RefundsPage,WithdrawalsPage,OrdersPage,CenterSettingsPage}.tsx`, `shared/InvoiceDialog.tsx`; xóa `features/reception/*` + các trang chỉ phục vụ Lễ tân; sửa Phòng tập, Khóa học, Doanh thu, menu Manager.


---

# 🛡️ Đợt 24–25/10/2026 — Siết chặt nghiệp vụ & luồng gói thành viên

> Chi tiết: `Doc/BUSINESS_HARDENING_PLAN.md` (rà soát + kết quả) và `Doc/MEMBERSHIP_FLOW.md` (gói thành viên).

## 20. Khóa học: mở bán, đăng ký muộn, hóa đơn

### 20.1. Trạng thái mở bán (`summary.saleState`, BE tính)
`ON_SALE` Đang mở bán · `FULL` Hết chỗ (tính cả chỗ đang giữ cho người chờ chuyển khoản) · `SALE_CLOSED` Ngừng nhận học viên mới · `ENDED` Đã kết thúc · `NOT_OPEN` Chưa duyệt.
Member/Guest chỉ thấy `ON_SALE` + `FULL` ở `GET /classes` (BE tự lọc). Coach/Manager thấy mọi khóa kèm nhãn.

### 20.2. Hạn mở bán
Ngừng nhận học viên mới khi đã diễn ra **≥ 50%** số buổi **hoặc** còn **< 3 buổi** (khóa ngắn hơn 3 buổi: so với tổng số buổi). Cấu hình `COURSE_SALE_MAX_PROGRESS_PERCENT`, `COURSE_SALE_MIN_REMAINING_SESSIONS`.

### 20.3. Đăng ký muộn — trả tiền theo buổi còn lại
- N = số buổi chính; đơn giá = giá trọn khóa ÷ N; k = số buổi bắt đầu **sau lúc mã QR hết hạn**.
- Thành tiền = giá trọn khóa nếu k ≥ N, ngược lại `min(giá trọn khóa, làm tròn lên 1.000đ (giá × k ÷ N))`.
- Bảng tính lưu ở `purchaseSnapshot.pricing`; **mọi khoản hoàn sau đó tính theo thành tiền ÷ k** (hủy buổi 80%, buổi bị hủy/dời 100%, hoàn ngoại lệ theo số buổi chưa học của chính hội viên).
- Mốc hủy khóa "≥ 3 ngày ⇒ hoàn 100%" tính theo **buổi đầu tiên của hội viên**.

### 20.4. Mua khóa chắc chắn
- Tạo QR: BE kiểm tra lại toàn bộ (còn mở bán, chưa mua, còn chỗ, không trùng giờ, không bị phạt) trong transaction có lock ⇒ giao dịch PENDING **giữ 1 chỗ** tới hết hạn QR.
- Mua rồi ⇒ 409 `COURSE_ALREADY_PURCHASED` (đã hủy khóa ⇒ mua lại được).
- Tiền về: ghi danh có kiểm sức chứa + kích hoạt lại chỗ đã hủy; thiếu buổi so với đã tính tiền ⇒ tự tạo yêu cầu hoàn phần thiếu `COURSE_NOT_FULFILLED` (0 buổi ⇒ hoàn toàn bộ, giao dịch `REQUIRES_REVIEW`).
- Ghi danh trọn khóa `POST /enrollments/bulk` với khóa có phí ⇒ phải đã mua (403 `CLASS_NOT_PURCHASED`).

### 20.5. Job bảo trì khóa học (5 phút, `POST /classes/maintenance` chạy tay)
PENDING quá giờ khai giảng ⇒ tự từ chối + nhả phòng · khóa chưa có học viên ⇒ báo HLV lúc 24h trước khai giảng và khi khai giảng · qua hạn mở bán mà 0 học viên ⇒ tự đóng (hủy buổi mã `NO_ENROLLMENT`, **không tính lỗi HLV**) · hết buổi ⇒ `COMPLETED`. Manager không duyệt được khóa đã quá giờ khai giảng (409 `CLASS_REVIEW_TOO_LATE`).

### 20.6. Hóa đơn & doanh thu
- `GET /payments/my/:id/invoice` (chủ giao dịch) · `GET /payments/:id/invoice` (Manager): người bán, người mua (ảnh chụp lúc mua), dòng hàng (SL × đơn giá = thành tiền), tạm tính, giảm, phí giao hàng, tổng, các khoản hoàn, thực trả sau hoàn.
- Mobile: hộp xác nhận mua khóa có bảng tính; màn **thanh toán thành công** hiện hóa đơn rút gọn; màn **Hóa đơn** mới. Web: hóa đơn in được từ trang Doanh thu.
- Doanh thu: **gộp** = SUCCESS + REFUNDED theo `paidAt`; **đã hoàn** = Σ khoản hoàn đã chuyển (theo `processedAt`); **thực nhận** = gộp − đã hoàn (sửa lỗi trừ hai lần).
- Lịch sử thanh toán đọc tên sản phẩm/gói **lúc mua**; cấp gói thành viên theo **số ngày lúc mua**.
- **Trình bày chi phí thống nhất** (Mobile widget `CostLineItem` + `CostSummary`): mỗi dòng ghi *Đơn giá × SL* và *Thành tiền*; khối tổng ghi *Tạm tính → Giảm giá (nếu có) → Phí giao hàng (đơn sản phẩm: số tiền / Miễn phí / Nhận tại quầy) → Tổng thanh toán*. Áp dụng ở: màn đặt hàng, màn QR đang chờ thanh toán (khối "Chi tiết đơn"), màn thanh toán thành công, Hóa đơn, chi tiết đơn hàng. Thẻ trong *Lịch sử thanh toán* và *Đơn mua* có dòng tóm tắt cách ra tổng (tạm tính · giảm · ship). `GET /payments/my` trả thêm `subtotal`, `discount`, `shippingFee`, `total`, `fulfillmentType`.
- **Gói thành viên:** hội viên mở *Chi tiết thanh toán* của gói từ thẻ thành viên (gói hiện tại), gói xếp hàng, lịch sử mua gói và *Lịch sử thanh toán*. Web: nút *Xem hóa đơn* ở chi tiết đơn hàng.

## 21. Gói thành viên (hội viên chỉ tập gym tự do)
Xem `Doc/MEMBERSHIP_FLOW.md`: CRUD gói trên Web, thẻ thành viên Mobile thiết kế lại với **mã QR động 60 giây**, quét thẻ + nhật ký vào cửa, gói xếp hàng (tối đa 3), nhắc gia hạn 7 ngày / 1 ngày, Manager hủy gói + hoàn phần còn lại.

## 22. Migration & áp lên DB Render
- `20261025000000_business_hardening` — cột `Class.alertStage/closedReason/closedAt`, `ClassSchedule.cancelCode`, enum `COURSE_NOT_FULFILLED`, backfill ảnh chụp người bán/người mua.
- `20261025010000_membership_flow` — cột gói/membership, bảng `MemberPassScan`, enum `MEMBERSHIP_CANCELLED`.
- Cả hai idempotent, chỉ THÊM. **Đã áp DB local, chưa áp Render.** Khi áp: `pg_dump "$RENDER_DATABASE_URL" -Fc -f backup_$(date +%Y%m%d).dump` rồi `cd BE && npx prisma migrate deploy`.
- Biến môi trường mới (tùy chọn): `COURSE_SALE_MAX_PROGRESS_PERCENT` (50), `COURSE_SALE_MIN_REMAINING_SESSIONS` (3).
