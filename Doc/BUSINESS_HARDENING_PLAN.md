# 🛡️ Kế hoạch siết chặt nghiệp vụ (24/10/2026)

> **Trạng thái:** ✅ ĐÃ DUYỆT (24/10) & ĐÃ LÀM (25/10/2026) — xem mục 7 "Kết quả" ở cuối file.
>
> **Phạm vi:** `BE/`, `Mobile/`, `FE/` (Web Manager). Không commit/push. Migration mới chỉ áp DB local (`scms_pg_local`), kèm hướng dẫn áp Render.
>
> Luật nào chốt xong sẽ được ghi tiếp vào `Doc/GYM_SCOPE_CHANGES.md` (mục mới) như các đợt trước.

---

## 0. Tóm tắt kết quả rà soát

Phần lớn luồng đã chặt (khóa advisory lock, CAS, outbox, snapshot đơn hàng, webhook SePay chống trùng). Tuy vậy còn **các lỗ hổng thật** — một số làm sai tiền:

| # | Mức | Vị trí | Vấn đề | Hậu quả |
|---|---|---|---|---|
| L1 | 🔴 | `sepay-payments.service.ts › createSepayCheckout` | Tạo QR mua khóa **không kiểm tra** đã mua chưa, còn chỗ không, trùng lịch, bị phạt chuyên cần, khóa còn buổi không. Mobile chặn nút nhưng BE không chặn. | Mua **2 lần** cùng khóa; mua khóa không còn buổi nào; gọi API trực tiếp là qua mặt được. |
| L2 | 🔴 | `payments.service.ts › autoEnrollAfterPayment` | Ghi danh sau khi thu tiền bằng `createMany` **không xét sức chứa**. | 2 người cùng thanh toán chỗ cuối ⇒ **vượt sức chứa** (overbooking). |
| L3 | 🔴 | như trên | `skipDuplicates` giữ nguyên chỗ đã `CANCELLED`. | Học viên từng hủy khóa rồi **mua lại ⇒ trả tiền nhưng 0 buổi** được ghi danh. |
| L4 | 🔴 | `reports.service.ts › getRevenueReport` | `totalRevenue` chỉ lấy `SUCCESS`, nhưng `refundedAmount` lại cộng tiền của giao dịch `REFUNDED` ⇒ trừ **hai lần**. Hoàn ngoại lệ có phí 30% vẫn bị tính là hoàn **100%** giao dịch. | Doanh thu thực nhận của Manager **bị thấp hơn thực tế**. |
| L5 | 🔴 | `memberships.service.ts › activateMembership` | Cấp gói theo `durationDays` **hiện tại** của gói, không theo ảnh chụp lúc mua. | Manager sửa gói 30 → 15 ngày trong lúc khách đang chuyển khoản ⇒ khách trả giá 30 ngày nhận 15 ngày. |
| L6 | 🟠 | `payments.service.ts › listMyPayments` | Lịch sử thanh toán trả `product.name` và `plan.name` **hiện tại** (không đọc snapshot). | Đổi tên sản phẩm/gói ⇒ lịch sử mua & hóa đơn của khách bị đổi theo. |
| L7 | 🟠 | `classes.service.ts › listClasses` | Member/Guest vẫn thấy khóa đã hết buổi / đã qua (chỉ lọc khi client tự gửi `hasUpcomingSchedules=true`). Không có trạng thái "đã kết thúc". | Khóa "chết" vẫn hiện trên app; `Class.status = COMPLETED` có trong enum nhưng **không bao giờ được set**. |
| L8 | 🟠 | `classes.service.ts › reviewClass` | Manager duyệt được khóa `PENDING` mà buổi khai giảng **đã trôi qua**; khóa PENDING quá hạn vẫn giữ phòng. | Khóa vừa duyệt đã thiếu buổi; HLV không biết khóa bị "bỏ quên". |
| L9 | 🟠 | Không có job | Không ai báo HLV khi khóa sắp/đã khai giảng mà **0 học viên**; không tự đóng khóa hết hạn. | Đúng ví dụ bạn nêu. |
| L10 | 🟠 | Giá khóa | Mua khi khóa đã diễn ra vài buổi vẫn trả **100% giá**; tiền hoàn 1 buổi = tiền đã trả ÷ **tổng** buổi của khóa (không phải số buổi người đó mua). | Người vào muộn bị thiệt; khi có giá theo buổi còn lại thì công thức hoàn sẽ sai. |
| L11 | 🟡 | `refunds.service.ts › courseRefundPercent` | Mốc "≥ 3 ngày" tính theo buổi khai giảng **của khóa**. | Người mua sau khai giảng không bao giờ được hoàn 100% dù buổi đầu **của họ** còn xa. |
| L12 | 🟡 | Mobile `class_purchase_bar.dart` | Hộp xác nhận ghi "hủy ≥ **24 giờ** trước khai giảng", BE thực tế là **3 ngày (72h)**. | Thông tin sai cho khách. |
| L13 | 🟡 | Mobile `invoice_screens.dart`, `payment_success_view.dart` | Hóa đơn tự dựng ở client: không có đơn giá, phí giao hàng, các khoản hoàn; màn thanh toán thành công chỉ có "Số tiền". | Không đáp ứng yêu cầu hóa đơn chi tiết. |
| L14 | 🟡 | Hóa đơn | Thông tin người bán (tên/địa chỉ trung tâm) và người mua không được chụp lại lúc mua. | Đổi thông tin trung tâm / tên khách ⇒ hóa đơn cũ đổi theo. |

---

## 1. Vòng đời khóa học (L7, L8, L9)

### 1.1. Trạng thái hiển thị (tính từ dữ liệu, không thêm enum)

| Nhãn (`saleState`) | Điều kiện | Member/Guest thấy? |
|---|---|---|
| `ON_SALE` — Đang mở bán | `APPROVED`, `isActive`, còn buổi tương lai, **chưa qua hạn mở bán** (mục 2.2) | ✅ |
| `SALE_CLOSED` — Ngừng nhận học viên mới | Còn buổi nhưng đã qua hạn mở bán | ❌ (người đã mua vẫn thấy trong "Khóa của tôi") |
| `FULL` — Hết chỗ | Còn trong hạn bán nhưng buổi còn lại đều kín | ✅ (nút mua bị khóa) |
| `ENDED` — Đã kết thúc | Không còn buổi `SCHEDULED` tương lai | ❌ |

- **BE tự lọc** cho Member/Guest ở `GET /classes` (không phụ thuộc tham số client); `GET /classes/:id` vẫn mở cho người đã mua (xem lại khóa cũ), người chưa mua nhận `saleState` để Mobile hiện "Khóa học đã ngừng nhận đăng ký".
- Coach/Manager thấy mọi khóa kèm nhãn `saleState`.

### 1.2. Job bảo trì khóa học (`runClassMaintenance`, mỗi 5 phút, idempotent, giống job cửa hàng/kỳ học)

| Tình huống | Xử lý |
|---|---|
| **A. Khóa `PENDING` mà buổi đầu tiên đã bắt đầu** (Manager chưa duyệt kịp) | Tự `REJECTED`, lý do *"Quá hạn duyệt — buổi khai giảng đã qua"*; hủy các buổi để nhả phòng; báo HLV (gửi lại với lịch mới) + Manager. |
| **B. Khóa `APPROVED`, còn 24h tới khai giảng mà 0 học viên** | Báo HLV: *"Khóa X khai giảng ngày… chưa có học viên — cân nhắc dời lịch/giữ nguyên"* (1 lần). |
| **C. Khóa `APPROVED`, đã khai giảng mà vẫn 0 học viên** | Báo HLV ngay khi buổi đầu bắt đầu (1 lần). Khóa vẫn mở bán tới hạn mở bán. |
| **D. Qua hạn mở bán mà 0 học viên** | **Tự đóng khóa**: hủy mọi buổi còn lại (nhả phòng, lý do mã `NO_ENROLLMENT`), khóa → `COMPLETED`, ẩn khỏi app; báo HLV + Manager. Các buổi hủy này **không tính vào tỷ lệ hủy buổi** khi xét đạt kỳ của HLV (`term-evaluator`). |
| **E. Mọi buổi chưa hủy đã kết thúc** | Khóa → `COMPLETED` (lưu lịch sử, thống kê vẫn đọc được); báo HLV tổng kết (số học viên, doanh thu). |
| **F. Giao dịch SePay khóa học `PENDING` quá hạn** | → `FAILED` (giải phóng chỗ đang giữ — mục 3.2). |

- Chống gửi trùng: thêm cột `Class.alertStage Int @default(0)` (bậc thông báo đã gửi — cùng cách `CoachTermStatus.lastReminderStage`) + `Class.closedReason String?`.
- `reviewClass(APPROVE)` chặn khi khóa không còn buổi tương lai hoặc đã qua hạn mở bán (409 `CLASS_REVIEW_TOO_LATE`).
- Manager vẫn chạy tay được qua `POST /classes/maintenance` (giống `/terms/maintenance`).

---

## 2. Đăng ký muộn & hạn mở bán (L10)

### 2.1. Tính tiền theo số buổi còn lại — **khuyến nghị: NÊN làm**

- `N` = tổng số buổi **chính** của khóa (không tính buổi dạy bù) — đúng con số đã dùng để tính tiền hoàn 1 buổi hiện nay.
- **Đơn giá 1 buổi** = `Giá trọn khóa ÷ N`.
- `k` = số buổi người mua **sẽ được ghi danh** (buổi `SCHEDULED` bắt đầu **sau thời điểm hết hạn mã QR**, để buổi nào được tính tiền chắc chắn còn khi tiền về).
- **Thành tiền** = `min(Giá trọn khóa, làm tròn lên 1.000đ (Đơn giá × k))`. Mua trước khai giảng ⇒ `k = N` ⇒ đúng giá trọn khóa.
- Hóa đơn ghi rõ: *Giá trọn khóa · Số buổi của khóa · Đơn giá/buổi · Số buổi đã diễn ra (không tính phí) · Số buổi được học · Giảm do đăng ký muộn · Thành tiền*.
- Snapshot lưu bảng tính này ⇒ **mọi phép hoàn tiền sau đó dùng `Thành tiền ÷ k`** (không dùng giá/số buổi hiện tại của khóa):
  - hủy 1 buổi ≥ 24h: 80% × (Thành tiền ÷ k);
  - buổi bị hủy không dạy bù / bị dời mà hủy: 100% × (Thành tiền ÷ k);
  - hoàn ngoại lệ: Thành tiền × (buổi chưa học của **người đó** ÷ k) − phí;
  - mốc "≥ 3 ngày ⇒ hoàn 100%" tính theo **buổi đầu tiên người đó được ghi danh** (sửa L11).
- HLV vẫn nhận 85% của **số tiền thực thu** (không đổi công thức ví).

> Phương án khác (không khuyến nghị): giữ nguyên giá trọn khóa — đơn giản nhưng người vào muộn trả tiền cho buổi họ không học, dễ bị khiếu nại.

### 2.2. Hạn mở bán — **khuyến nghị: NÊN làm**

Lý do: khóa gym là lộ trình tăng dần; người vào khi đã qua nửa khóa khó theo kịp, HLV phải kèm riêng, và số buổi còn lại quá ít không đáng một lần mua.

Khóa **ngừng nhận học viên mới** khi xảy ra **điều kiện nào trước**:
1. Đã diễn ra **≥ 50%** số buổi chính (`COURSE_SALE_MAX_PROGRESS_PERCENT=50`), **hoặc**
2. Còn **< 3 buổi** (`COURSE_SALE_MIN_REMAINING_SESSIONS=3`).

(Cả hai cấu hình được qua biến môi trường.) Ví dụ khóa 12 buổi: mua được tới hết buổi thứ 5; khóa 4 buổi: chỉ mua được trước buổi thứ 2.

---

## 3. Mua khóa học chắc chắn (L1, L2, L3)

### 3.1. Kiểm tra lại toàn bộ ở BE khi tạo QR
`createSepayCheckout` (và ghi nhận tay `createPayment` của Manager) dùng chung bộ luật `evaluateCourseEligibility` + thêm:
- khóa đang `ON_SALE`;
- **chưa có giao dịch SUCCESS còn hiệu lực** cho khóa này (đã hủy khóa ⇒ được mua lại);
- số tiền = **Thành tiền** mục 2.1 (Manager ghi tay cũng phải đúng số này).

### 3.2. Giữ chỗ trong lúc chờ chuyển khoản
Giao dịch SePay `PENDING` còn hạn được **tính như một chỗ đã giữ** khi xét sức chứa ⇒ hai người không thể cùng trả tiền cho chỗ cuối cùng. Quá hạn ⇒ nhả chỗ (job mục 1.2-F).

### 3.3. Ghi danh khi tiền về
Thay `autoEnrollAfterPayment` bằng ghi danh có khóa (lock) + kiểm sức chứa + **kích hoạt lại chỗ đã hủy**. Nếu không còn ghi danh được đủ số buổi đã tính tiền (khóa bị hủy, buổi bị hủy trong lúc chờ…):
- tiền vẫn `SUCCESS`, cấp quyền `REQUIRES_REVIEW`;
- **tự tạo yêu cầu hoàn tiền** phần thiếu (lý do mới `COURSE_NOT_FULFILLED`) để Manager chuyển khoản — giống cách đơn hàng tiền về muộn đang làm; báo khách + Manager.

---

## 4. Hóa đơn & lịch sử mua (L5, L6, L13, L14)

### 4.1. API hóa đơn chuẩn (BE dựng, mọi client dùng chung)
- `GET /payments/my/:id/invoice` (chủ giao dịch) · `GET /payments/:id/invoice` (Manager).
- Nội dung, **chỉ đọc từ snapshot + bảng giao dịch**:
  - **Người bán**: tên, địa chỉ, hotline trung tâm *tại thời điểm mua*.
  - **Người mua**: họ tên, SĐT, email *tại thời điểm mua*.
  - **Thông tin hóa đơn**: số hóa đơn (= mã thanh toán/mã đơn), ngày tạo, ngày thanh toán, phương thức, mã giao dịch ngân hàng.
  - **Bảng dòng hàng**: STT · Tên hàng · ĐVT (buổi/tháng/cái) · Số lượng · Đơn giá · Thành tiền.
    - Khóa học: 1 dòng "Khóa X — k buổi" + dòng giảm "Đăng ký muộn (n buổi đã diễn ra)" nếu có.
    - Gói thành viên: 1 dòng "Gói X — D ngày", kèm hiệu lực từ–đến.
    - Đơn hàng: từng sản phẩm.
  - **Tổng hợp**: Tạm tính · Giảm giá · Phí giao hàng · **Tổng thanh toán** · Đã thanh toán.
  - **Hoàn tiền**: từng khoản (ngày, lý do, số tiền, trạng thái) · **Còn lại thực trả**.
- Snapshot bổ sung khi tạo giao dịch: `seller`, `buyer`, `pricing` (bảng tính). Giao dịch cũ thiếu snapshot ⇒ migration backfill từ dữ liệu hiện có (chấp nhận được vì đó là dữ liệu tốt nhất còn lại).

### 4.2. Sửa chỗ đang đọc dữ liệu hiện tại
- `listMyPayments`: tên sản phẩm lấy `OrderItem.productName`; tên gói lấy `purchaseSnapshot.name`.
- `activateMembership`: số ngày lấy `purchaseSnapshot.durationDays` (L5).
- `membershipPlanNameOf`, `verifyMembership`: tên gói theo snapshot giao dịch.
- Báo cáo lượt đăng ký (`getEnrollmentReport`) giữ tên khóa hiện tại (đây là thống kê vận hành, không phải tiền) — sẽ ghi chú rõ.

### 4.3. Thống kê doanh thu (L4)
- **Doanh thu gộp** = Σ giao dịch đã thu trong kỳ (`SUCCESS` + `REFUNDED`, theo `paidAt`).
- **Đã hoàn** = Σ `Refund.amount` **COMPLETED** trong kỳ (theo `processedAt`) — đúng số tiền thực trả lại, kể cả hoàn có phí.
- **Thực nhận** = Gộp − Đã hoàn. Doanh thu theo mặt hàng có thêm cột "đã hoàn".
- Web: đổi nhãn KPI cho khớp ("Doanh thu gộp / Đã hoàn / Thực nhận").

### 4.4. Mobile
- **Hộp xác nhận mua khóa**: bảng tính mục 2.1 (giá trọn khóa, số buổi, đơn giá, buổi đã qua, thành tiền) + luật hủy đúng **3 ngày** (L12).
- **Màn thanh toán (QR)**: thêm khối "Chi tiết đơn" thu gọn được (dòng hàng + tổng).
- **Màn thanh toán thành công**: hiển thị hóa đơn rút gọn đầy đủ (dòng hàng, tạm tính, giảm, phí ship, tổng, phương thức, thời gian, mã giao dịch) + nút "Xem hóa đơn".
- **Chi tiết hóa đơn**: dựng lại theo API 4.1 (gọi thẳng theo id, không quét cả danh sách).
- Khóa không còn mở bán: thông báo rõ lý do (`SALE_CLOSED` / `ENDED` / `FULL`).
- Coach: thẻ khóa hiển thị nhãn `saleState` + cảnh báo "chưa có học viên".

### 4.5. Web (Manager)
- `InvoiceDialog` dùng API 4.1 (in được).
- Trang Khóa học: cột/nhãn `saleState`, lý do đóng tự động; nút chạy bảo trì.
- Trang Doanh thu: số liệu mục 4.3.

---

## 5. Đề xuất thêm (không bắt buộc — làm nếu bạn đồng ý)

1. **Nhắc học viên 24h trước buổi học** (`UPCOMING_CLASS`) tự động trong job khóa học — hiện chỉ gửi khi gọi tay.
2. **Ngưỡng học viên tối thiểu để khai giảng** (VD < 3 người lúc 24h trước khai giảng ⇒ HLV chọn *vẫn dạy* hoặc *hủy khóa hoàn 100%*). Cần thêm màn quyết định cho HLV — đề xuất để đợt sau.
3. **Xuất hóa đơn PDF** trên Web/Mobile — đợt sau.

---

## 6. Thứ tự làm & kiểm thử

| Bước | Nội dung | Kiểm thử |
|---|---|---|
| 1 | Migration: `Class.alertStage`, `Class.closedReason`, enum `RefundReason.COURSE_NOT_FULFILLED`; backfill snapshot `seller/buyer/pricing` | `prisma migrate diff` → áp local |
| 2 | BE: giá theo buổi còn lại + hạn mở bán + `saleState` + lọc danh sách | test mới `tests/business-hardening.local.ts` |
| 3 | BE: checkout kiểm tra đủ, giữ chỗ khi chờ CK, ghi danh có sức chứa, hoàn phần thiếu | như trên + `sepay-payment`, `course-enrollment` cũ |
| 4 | BE: công thức hoàn tiền theo snapshot | như trên + `gym-scope` cũ |
| 5 | BE: job bảo trì khóa học + chặn duyệt muộn + loại buổi `NO_ENROLLMENT` khỏi tỷ lệ hủy | như trên + `coach-term` cũ |
| 6 | BE: API hóa đơn, sửa snapshot gói/sản phẩm, báo cáo doanh thu | như trên + `admin-web`, `shop` cũ |
| 7 | Mobile: xác nhận mua, QR, thanh toán thành công, hóa đơn, nhãn khóa | `dart format`, `flutter analyze`, `flutter test` |
| 8 | Web: hóa đơn, khóa học, doanh thu | `npx tsc --noEmit`, `npx vitest run`, chạy thử trình duyệt với BE local |
| 9 | Cập nhật `Doc/GYM_SCOPE_CHANGES.md` (mục mới) + hướng dẫn áp Render | — |

---

## 7. Kết quả (25/10/2026)

Đã làm toàn bộ mục 1–4 theo phương án khuyến nghị. Luật chốt được ghi ở `Doc/GYM_SCOPE_CHANGES.md` §20.

### 7.1. Phát sinh thêm khi làm
| # | Vấn đề | Đã xử lý |
|---|---|---|
| L15 | `POST /enrollments/bulk` cho ghi danh trọn khóa **không cần thanh toán** (Web còn gọi) | Khóa có phí ⇒ phải có giao dịch còn quyền học, ngược lại 403 `CLASS_NOT_PURCHASED` |
| L16 | Đặt buổi lẻ chỉ kiểm "có giao dịch SUCCESS" ⇒ đã được hoàn ngoại lệ vẫn đặt lại buổi được | Giao dịch đã có hoàn cấp khóa (`MEMBER_CANCEL_COURSE_LATE`, `COURSE_NOT_FULFILLED`) không còn quyền đặt |
| L17 | Tự đóng khóa không học viên sẽ làm HLV bị tính "hủy buổi" khi xét đạt kỳ | Buổi hủy mã `NO_ENROLLMENT` **không tính hủy, không tính phải dạy**, vẫn giữ trong lịch để điều kiện "đủ buổi" của kỳ không mất (`term-evaluator`) |
| L18 | Web `InvoiceDialog` gọi `GET /invoices/{id}` (API đã bỏ) | Viết lại theo API hóa đơn mới |
| L19 | Web: link Dashboard `/manager/membership-plans` dẫn vào trang trống | Làm trang Gói thành viên (xem `Doc/MEMBERSHIP_FLOW.md`) |

### 7.2. Khác với kế hoạch
- **Không** tự chuyển giao dịch SePay khóa học quá hạn sang `FAILED` trong job (mục 1.2-F): làm vậy sẽ biến tiền về muộn vài phút thành "tiền về khi đơn đã đóng" (không ghi danh). Giữ hành vi cũ — giao dịch quá hạn chỉ **hết giữ chỗ**; tiền về muộn vẫn được ghi danh nếu còn chỗ, hết chỗ thì tự tạo yêu cầu hoàn (mục 3.3).
- Mốc hủy khóa "≥ 3 ngày" tính theo **buổi đầu tiên hội viên được ghi danh** cho mọi hội viên (không riêng người mua muộn).

### 7.3. Kiểm thử
| Phạm vi | Lệnh | Kết quả |
|---|---|---|
| BE type-check | `cd BE && npx tsc --noEmit` | sạch |
| Luồng mới | `npm run dev:local` + `npm run test:hardening:local` | **28/28** |
| Gói thành viên | `npm run test:membership:local` | **29/29** |
| E2E cũ | `npm run test:local` | auth 46/46 · wallet 35/35 · shop 141/141 · admin-web 90/90 · coach-term 104/104 · coach-checkin 51/51 · mobile-api 48/55 (7 case lỗi sẵn từ 19/10, viết theo luật hủy cũ; fixture khóa 3 buổi đổi thành 4 buổi cho khớp hạn mở bán) |
| `test:gym:local` | | 38/40 — 2 case "dời buổi" trùng lịch seed của HLV ngày 16/11 (`COACH_CONFLICT`, phụ thuộc ngày chạy, không liên quan thay đổi) |
| Mobile | `flutter analyze` · `flutter test --exclude-tags live` | sạch · **146/146** |
| FE | `npx tsc --noEmit` · `npx vitest run` | sạch · 49/49 |
| FE thủ công | Trình duyệt + BE local | Gói thành viên (thêm/xóa), Hội viên & thẻ (quét mã QR động, nhật ký), Doanh thu (KPI + hóa đơn in), Khóa học (nhãn mở bán) — không lỗi console |

> Các bộ `course-enrollment.e2e.ts`, `sepay-payment.e2e.ts`, `enrollment-quota.e2e.ts` đã hỏng từ trước (tham chiếu module `subscriptions` đã xóa / tạo user kiểu role cũ) và không nằm trong `test:local`.
