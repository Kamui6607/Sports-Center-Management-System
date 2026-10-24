# Kỳ học & quyền lợi của HLV (Coach)

> **Vấn đề:** HLV được tập gym miễn phí như một quyền lợi, nhưng có HLV không tạo khóa, không dạy mà vẫn vào tập. Chỉ nhắc nhở thì không ép được.
> **Cách xử lý (phương án C, giai đoạn A + thẻ ra vào; chưa có B):** gắn quyền lợi với việc **dạy thật** theo từng **kỳ**. Hệ thống **đánh giá + nhắc + báo cáo + thẻ ra vào**; người quét thẻ ở cửa quyết định cho vào. **Không tự khóa tài khoản.**

## 1. Quy tắc

- **Kỳ:** 3 kỳ/năm dương lịch, mỗi kỳ 4 tháng (T1–4, T5–8, T9–12), mốc theo giờ Việt Nam. BE tự tạo (năm trước, năm nay, năm sau).
- **Ai được đánh giá:** HLV có CV `APPROVED` và tài khoản đang bật, đã có mặt trước khi kỳ kết thúc.
- **Hạn ân hạn:** mặc định **14 ngày** kể từ đầu kỳ (Manager chỉnh 0–60 ngày theo kỳ). HLV tạo tài khoản **trong** kỳ thì ân hạn tính từ ngày CV được duyệt; HLV cũ thì tính từ đầu kỳ (nộp lại CV không "reset" ân hạn).

| Giai đoạn | Điều kiện đạt |
|---|---|
| **Đăng ký kỳ** (hết ân hạn) | Có ≥ 1 khóa `PENDING/APPROVED/COMPLETED`, đang bật, với **≥ 8 buổi không hủy** trong kỳ, trải ≥ **28 ngày**. Khóa `PENDING` vẫn tính (Manager duyệt chậm không phải lỗi HLV). Khóa nháp / bị từ chối không tính. |
| **Chốt cuối kỳ** | Tính trên mọi buổi của HLV trong kỳ: tỷ lệ đã dạy ≥ **90%**; tỷ lệ hủy ≤ **20%**; buổi đã dạy **có học viên** phải có bằng chứng (điểm danh hoặc mã QR do HLV cấp) ≥ **80%**. |

- Buổi chính bị hủy nhưng đã **dạy bù** (buổi bù còn hiệu lực) không tính là hủy.
- Buổi đã qua nhưng HLV không bấm "Hoàn tất" **không** được tính là đã dạy (tự khai COMPLETED cũng cần bằng chứng khi có học viên).
- Khóa không có học viên không tính lỗi HLV, nhưng vẫn phải đủ buổi (chặn "khóa ma").
- **Nghỉ phép/ốm được duyệt:** cộng đúng số ngày nghỉ vào hạn ân hạn; buổi hủy trong thời gian nghỉ không tính; nghỉ ≥ **50%** kỳ ⇒ miễn cả kỳ.
- **Miễn trừ thủ công** của Manager luôn thắng (đánh giá tự động không ghi đè).
- Trạng thái: `PENDING` (chờ đủ điều kiện) · `COMPLIANT` (đạt) · `NON_COMPLIANT` (chưa đạt) · `EXEMPT` (miễn). Giữa kỳ chỉ là **tạm thời** (`final=false`, có thể kèm `atRisk` + cảnh báo); kết quả cuối chốt khi kỳ kết thúc.

Mọi ngưỡng nằm ở `BE/src/config/coach-term.ts`.

## 2. Thẻ ra vào của HLV

- HLV mở **Thẻ ra vào** trên app: QR chứa JWT loại `COACH_PASS` sống **60 giây** (app tự đổi mỗi ~45 giây). Không dùng `userId` thô vì `userId` HLV lộ trong dữ liệu khóa học công khai.
- **Manager** quét ở Web (`Kỳ học & quyền lợi HLV › Thẻ ra vào`: camera hoặc dán mã) ⇒ `POST /terms/pass/verify` ⇒ `valid` + `level` (`OK` / `WARN` / `DENY`) + lý do, **ghi nhật ký** `CoachPassScan`.
- `COMPLIANT`/`EXEMPT` ⇒ hợp lệ. `PENDING` ⇒ hợp lệ nhưng `WARN` (còn N ngày). `NON_COMPLIANT` ⇒ không hợp lệ.
- **Chính sách "kỳ trước chưa đạt"** (`STRICT_AFTER_FAILED_TERM`): nếu kỳ trước `NON_COMPLIANT` thì ở kỳ mới, thẻ chỉ hợp lệ khi HLV đã `COMPLIANT`/`EXEMPT` — không được hưởng thêm 14 ngày ân hạn mỗi kỳ.
- Access token không dùng làm thẻ và ngược lại (`verifyAccessToken` yêu cầu có `id` + `role`).

## 3. Thông báo bậc thang (job)

`runTermMaintenance` (mỗi 30 phút ở server + sau 30 giây khi khởi động; Manager gọi tay `POST /terms/maintenance`). Idempotent, an toàn khi nhiều instance chạy (CAS trên `CoachTermStatus.lastReminderStage` và `AcademicTerm.managerReportStage`).

| Bậc | Thời điểm | Gửi cho |
|---|---|---|
| 1–3 | 14 / 7 / 1 ngày trước kỳ | HLV chưa có khóa hợp lệ |
| 4 | Ngày bắt đầu kỳ | HLV chưa có khóa hợp lệ |
| 5–6 | Hạn − 7 ngày / − 1 ngày | HLV chưa có khóa hợp lệ |
| 7 | Quá hạn | HLV chưa đạt + **báo cáo Manager** (danh sách chưa đạt) |
| 8 | Kỳ kết thúc | HLV (đạt / chưa đạt, trừ được miễn) + **báo cáo Manager** (kết quả) |

Bỏ lỡ nhiều bậc (server ngủ) thì chỉ gửi bậc **mới nhất**. Loại thông báo là `GENERAL` + `metadata.kind` (`COACH_TERM_REMINDER`, `COACH_TERM_MANAGER_REPORT`, `COACH_LEAVE_REQUESTED`, `COACH_LEAVE_REVIEWED`, `COACH_TERM_EXEMPT`) để không phải sửa enum trên DB dùng chung.

> **Lưu ý hạ tầng:** timer chỉ chạy khi process đang thức (Render gói miễn phí có thể ngủ). Manager vẫn bấm "Gửi nhắc ngay" trên Web, hoặc cron ngoài gọi `POST /terms/maintenance`. Kết quả đánh giá luôn được tính lại khi Manager mở bảng.

## 4. Dữ liệu

Migration `20261023000000_coach_terms` (idempotent, chỉ **thêm**: không DROP/DELETE, không sửa bảng cũ):

- `AcademicTerm` (kỳ; `@@unique([year, seq])`), `CoachTermStatus` (Coach × kỳ: state, metrics JSON, miễn trừ, bậc nhắc), `CoachLeave` (đơn nghỉ), `CoachPassScan` (nhật ký quét thẻ).
- Enum `CoachTermState`, `CoachLeaveStatus`.
- Khóa học **không** có khóa ngoại sang kỳ: kỳ của buổi suy ra từ `ClassSchedule.startTime`.

## 5. API (`/api/v1/terms`)

| Ai | Endpoint | Việc |
|---|---|---|
| COACH, MANAGER | `GET /terms`, `GET /terms/current` | Danh sách kỳ / kỳ hiện tại |
| COACH | `GET /terms/me` | Trạng thái của tôi + luật + kết luận thẻ |
| COACH | `GET /terms/me/pass` | Mã thẻ (JWT 60 giây) |
| COACH | `GET/POST /terms/me/leaves`, `DELETE /terms/me/leaves/:id` | Xin nghỉ / xem / hủy |
| MANAGER | `GET /terms/:id/coaches` | Bảng Coach × kỳ (lọc `state`, `search`) |
| MANAGER | `POST /terms/:id/evaluate` | Đánh giá và lưu kết quả |
| MANAGER | `PATCH /terms/:id` | Chỉnh ân hạn (0–60 ngày) |
| MANAGER | `PUT/DELETE /terms/:id/coaches/:coachId/exempt` | Miễn trừ / bỏ miễn trừ (có lý do) |
| MANAGER | `GET /terms/leaves`, `PATCH /terms/leaves/:id/review` | Duyệt / từ chối nghỉ phép |
| MANAGER | `POST /terms/pass/verify`, `GET /terms/pass/scans` | Quét thẻ / nhật ký |
| MANAGER | `POST /terms/maintenance` | Chạy job ngay |

## 6. Giao diện

- **Web Manager:** `Con người › Kỳ học & quyền lợi HLV` (`/manager/terms`) — 3 tab: Đánh giá HLV · Nghỉ phép · Thẻ ra vào.
- **Mobile Coach:** thẻ tóm tắt ở Tổng quan → màn *Kỳ học & quyền lợi* (`/coach/term`: trạng thái, tiến độ, đơn nghỉ), *Xin nghỉ phép* (`/coach/term/leave`), *Thẻ ra vào* (`/coach/pass`).

## 7. Áp lên DB dùng chung (Render)

1. Báo nhóm + `pg_dump`.
2. `cd BE && npx prisma migrate deploy` — áp 2 migration idempotent: `20261023000000_coach_terms` và `20261024000000_coach_checkin` (chạy lại an toàn).
3. `npx prisma generate`, restart BE.
4. Kỳ được tạo tự động ở lần gọi đầu; không cần seed.

## 8. Kiểm thử

- BE: `npx tsx tests/coach-term.e2e.ts` (hoặc `npm run test:local -- coach-term`) — kỳ, đăng ký, khóa ma, nghỉ phép, miễn trừ, chốt cuối kỳ, thẻ, job nhắc (giả lập thời gian). Test tự dựng kỳ riêng (năm ≥ 3000) nên không phụ thuộc lịch thật.
- FE: `npx vitest run` (`tests/terms.test.ts`). Mobile: `flutter test` (`test/features/coach_term_api_repository_test.dart`, `test/mock/coach_term_flow_test.dart`, quét màn hình).

## 9. Chưa làm / giới hạn

- **Không tự khóa** tài khoản hay chặn cổng (phương án B): cần dữ liệu thật của một kỳ để kiểm chứng tiêu chí trước. Nhật ký quét thẻ + bảng kết quả là nền để bật sau.
- Chưa có thiết bị quét trên Mobile cho Manager (Manager dùng Web).
- Chưa có cron ngoài; xem lưu ý hạ tầng ở mục 3.

## 10. Check-in phòng gym & phí (theo yêu cầu của leader)

**Luồng:** Manager hiển thị mã QR check-in ở quầy (Web, đổi mỗi ~45 giây) ⇒ HLV quét bằng app ⇒ hệ thống ghi **MỘT ngày dùng phòng** (ngày giờ VN). Quét lại trong ngày không tính thêm. (Thẻ ra vào ở §2 — HLV đưa QR cho Manager quét — vẫn còn để kiểm tra nhanh tình trạng; check-in là nguồn tính ngày dùng và phí.)

**Phí (mặc định, chỉnh ở `COACH_CHECKIN` trong `BE/src/config/coach-term.ts`):**

| Tình huống | Kết quả |
|---|---|
| Thẻ hợp lệ (đạt / miễn / đang ân hạn, kỳ trước không rớt) **và** còn trong **20 ngày miễn phí/tháng** | Miễn phí |
| Quá 20 ngày trong tháng | **20.000đ/ngày** |
| Thẻ không hợp lệ (chưa đạt kỳ, hoặc kỳ trước rớt mà kỳ này chưa đạt) | Tính phí **ngay từ ngày đầu** |

**Trừ tiền — khóa cũ nhất trước (FIFO):** phí được trừ từ **tiền ròng của khóa tạo sớm nhất còn dư** (tiền ròng = `DEPOSIT − REFUND_DEBIT − CHECKIN_FEE`), rồi sang khóa kế tiếp nếu chưa đủ. Mỗi khoản trừ là một `WalletTransaction` loại **`CHECKIN_FEE`** gắn `classId` — nhờ vậy cách tính **rút tiền theo từng khóa** vẫn khớp. Không trừ vào phần đang tạm giữ cho hoàn tiền / lệnh rút chờ duyệt, và không làm số dư âm.

**Ví chưa đủ tiền:** vẫn cho check-in, phần chưa trừ được ghi vào `CoachWallet.feeDebt`. Nợ được trừ dần (ưu tiên trước phí mới) mỗi khi HLV check-in, xem ví hoặc yêu cầu rút; **số dư khả dụng để rút đã trừ nợ**.

**API:** `POST /terms/check-in/qr` (MANAGER) · `POST /terms/check-in` (COACH, `{ token }`) · `GET /terms/me/check-ins` (COACH) · `GET /terms/check-ins` (MANAGER, lọc `dayKey`/`monthKey`/`coachId`, kèm tổng hợp phí). Lỗi thường gặp: `CHECKIN_QR_EXPIRED`, `CHECKIN_QR_INVALID`, `CHECKIN_NOT_ELIGIBLE`.

**Giao diện:** Web Manager — tab *Check-in phòng gym* (QR + nhật ký + tổng hợp). Mobile Coach — *Check-in phòng gym* (nút trên thanh tiêu đề Tổng quan và trong màn Kỳ học): hạn mức tháng, phí, nợ, quét QR (có nhập mã thủ công); giao dịch ví hiện loại "Phí check-in phòng gym".

**Dữ liệu:** migration `20261024000000_coach_checkin` (idempotent, chỉ thêm): giá trị enum `TransactionType.CHECKIN_FEE`, cột `CoachWallet.feeDebt`, bảng `CoachCheckIn` (`@@unique([coachId, dayKey])` chống tính trùng ngày).

**Các điểm đã giả định (chưa được leader xác nhận):** 20 ngày/tháng và 20.000đ/ngày; "ví cũ nhất" hiểu là khóa tạo sớm nhất còn tiền ròng; ví thiếu tiền thì cho check-in và ghi nợ; không giới hạn khung giờ mở cửa (giờ mở cửa trong `CenterSetting` là chữ tự do). Manager chưa có thao tác miễn/hoàn phí cho từng lượt.
