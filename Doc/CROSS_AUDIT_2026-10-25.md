# Cross-Reference Audit — BE · Mobile · Web Admin (25/10/2026)

Phạm vi: `develop` @ `5e175dc` (gồm commit 25/10 "harden course sales… membership flow"). Trọng tâm: Web Admin (`FE/src/features/manage`).

**Mức độ chứng cứ:**
- **[LIVE]**: đã gọi API thật trên DB test `sports_center_admin_test`, BE :8091.
- **[CODE]**: xác minh bằng đọc source, có dẫn file và dòng.

Không sửa code nghiệp vụ, không chạm DB demo `sports_center_local`. Để chạy kiểm chứng LIVE, em đã áp 5 migration mới (20/10 → 25/10) lên **riêng** DB test.

Tình trạng CI tại thời điểm audit:

| Lệnh | Kết quả |
|---|---|
| BE `npx tsc --noEmit` | ✅ đạt |
| FE `npm test` | ✅ 49/49 |
| FE `npm run typecheck` | ❌ 1 lỗi TS6133 — xem U7 |

---

## PHẦN 1 — Bản đồ ngữ cảnh hệ thống

### 1.1 Backend

- 231 route, 22 module mount dưới `/api/v1` (`BE/src/app.ts:90-112`), cộng nhóm `membership-plans`.
- Route quản trị đều bọc `authenticate` + `authorize("MANAGER")`.
- Job nền chạy trong `BE/src/server.ts`: outbox, cửa hàng, kỳ học HLV, khóa học, gói thành viên. **Không có job phạt chuyên cần.**

| Nhóm nghiệp vụ | API chính |
|---|---|
| Tài khoản | `/auth/*` (đăng nhập, refresh, OTP), `/users/*` (CRUD, khóa, cấp lại mật khẩu, lịch sử, xóa vĩnh viễn), `/members/*` |
| HLV | `/coaches/*` (hồ sơ, CV, ví, rút tiền), `/terms/*` (kỳ học, nghỉ phép, miễn trừ, check-in, pass) |
| Đào tạo | `/classes/*` (nháp → duyệt, mở bán, bảo trì), `/class-schedules/*` (HLV tạo/dời/hủy), `/enrollments/*` (giữ chỗ, chuyển buổi), `/attendance/*` (điểm danh, QR, **phạt + khiếu nại**), `/training-plans/*`, `/feedbacks/*` |
| Tiền | `/payments/*` (SePay checkout/webhook, hóa đơn, **retry-activation**), `/refunds/*`, `/reports/*` (revenue, members, enrollments, memberships, **attendance**, **subscription-logs**) |
| Cửa hàng | `/products/*`, `/shop/*` (giỏ, checkout, đơn, nhận tại quầy, tồn kho, đánh giá) |
| Gói thành viên | `/membership-plans/*`, `/memberships/*` (mua, pass QR, quét, hủy hoàn tiền) |
| Khác | `/center`, `/notifications/*`, `/chat/*`, `/locations/*`, `/rooms/*` |

### 1.2 Mobile (Flutter, `Mobile/lib/features`)

- **Hội viên:** catalog, mua khóa (SePay), lịch và giữ chỗ, chuyển buổi, điểm danh QR, **khiếu nại phạt chuyên cần**, hoàn tiền, gói thành viên và pass QR, cửa hàng (giỏ, checkout, nhận hàng, hoàn), đánh giá HLV, chat, thông báo, hồ sơ.
- **HLV:** nháp và gửi duyệt khóa, lịch dạy, mở QR điểm danh, kế hoạch tập, ví và rút tiền, kỳ học (nghỉ phép, check-in, pass), CV.
- **Manager trên Mobile** (`features/manager`): đếm việc chờ duyệt, duyệt khóa, CV, rút tiền; xác minh mã nhận hàng.

### 1.3 Web Admin đang có

21 màn trong `ManagerLayout.tsx:434-457`, gọi 108 endpoint (tính theo file thật sự được import):

Tổng quan · Người dùng · HLV (+CV) · Kỳ học HLV · Khóa học · Lịch học · Phòng · Gói thành viên · Hội viên & thẻ · Sản phẩm (+kho, đánh giá) · Đơn hàng · Doanh thu (+hóa đơn, CSV) · Hoàn tiền · Rút tiền HLV · Cài đặt trung tâm · Tài khoản.

### 1.4 BE/Mobile đã có nhưng Web Admin thiếu

| # | Tính năng | API BE sẵn có | Phía người dùng | Ảnh hưởng | Nhãn |
|---|---|---|---|---|---|
| 1 | Giao dịch đã thu tiền nhưng chưa kích hoạt (`activationStatus = REQUIRES_REVIEW`) + nút **Kích hoạt lại** | `POST /payments/:id/retry-activation`; field `activationStatus`, `reviewReason` | Hội viên đã chuyển khoản nhưng chưa được ghi danh | Tiền đã vào, khách không có khóa; Admin không thấy, không xử lý được | **CRITICAL** + MISSING |
| 2 | Phạt chuyên cần & **khiếu nại** | `GET /attendance/penalties`, `POST …/preview`, `…/apply`, `…/:id/revoke`, `POST /attendance/warnings/scan` | Mobile cho hội viên khiếu nại, hiện "chờ Quản lý xem xét" (`attendance_screen.dart:176`) | Khiếu nại không ai xử lý; không có job tự áp phạt. `features/manage/AttendancePenalties.tsx` còn tồn tại nhưng **không được route** | MISSING (cao) |
| 3 | Kiểm duyệt đánh giá HLV | `GET /feedbacks?coachId=`, `DELETE /feedbacks/:id/manager` | Hội viên đánh giá HLV trên Mobile | Không gỡ được đánh giá vi phạm | MISSING |
| 4 | Báo cáo chuyên cần, hội viên, nhật ký gói | `GET /reports/attendance`, `/reports/members`, `/reports/subscription-logs` | — | Thiếu số liệu vận hành ngoài doanh thu | MISSING |
| 5 | Sửa điểm danh của một buổi | `PUT /attendance/schedule/:scheduleId`, `PATCH /attendance/:id` (cho phép MANAGER) | HLV điểm danh trên Mobile | Không sửa được điểm danh sai khi HLV nhầm | MISSING (cần anh xác nhận phạm vi) |
| 6 | Danh sách tồn kho / sắp hết | `GET /shop/manage/inventory` | — | Dashboard chỉ hiện con số | MISSING (thấp) |
| 7 | Push / banner do Manager soạn | **BE không có API** (chỉ có `POST /notifications/trigger-upcoming-reminders`) | Mobile nhận thông báo | Phải làm BE trước (bảng banner/broadcast + endpoint), không phải lỗi của Admin | Ghi nhận |
| 8 | Ghi danh hộ, chuyển buổi hộ, thu tiền mặt khóa học | `POST /enrollments(+bulk)` với `memberId`, `GET /enrollments/:id/transfer-options`, `POST /payments` | — | Đã chốt không đưa lên Web (D2). Chỉ mở nếu anh đổi quyết định | Cần quyết định |

---

## PHẦN 2 — Logic & bảo mật (BE ↔ Admin)

### 2.1 Điểm tốt đã xác minh

- **Phân quyền:** mọi route `/users`, `/reports`, `/refunds`, `/shop/manage`, `/terms` (phần quản lý), `/memberships` (phần quản lý), `/payments` (quản lý) đều có `authenticate` + `authorize("MANAGER")` (bảng route tạo từ source).
- **Web chặn vai trò:** chỉ render khi `GET /auth/me` trả MANAGER (`features/auth/Session.tsx`).
- **Webhook SePay:** HMAC có cửa sổ thời gian hoặc API key so sánh hằng thời gian (`BE/src/config/sepay.ts:159-167`); chống replay bằng `sepayId` unique; `mock-confirm` bị chặn cứng khi `NODE_ENV=production` (`sepay-payments.service.ts:557-577`).
- **Kiểm quyền sở hữu đúng:**
  - `DELETE /enrollments/:id` (`enrollments.service.ts:214`)
  - `POST /enrollments(/bulk)`: chọn `memberId` theo vai trò (`enrollments.controller.ts:16-35`)
  - `GET /refunds/:id` (`refunds.service.ts:952`)
  - `GET /payments/:id` (`payments.service.ts:177-185`)
  - Tệp đính kèm chat (`getAuthorizedAttachment`)
  - Training plans (`training-plans.service.ts:13,96,191`)
  - `PATCH /coaches/:id` (`coaches.service.ts:152`)
- **Race condition đã có khóa:**
  - Duyệt hoàn tiền: khóa payment rồi đọc lại trạng thái (`refunds.service.ts:684-700`)
  - Duyệt rút tiền: khóa ví + CAS
  - Hủy gói thành viên: CAS
  - Duyệt khóa học: CAS
  - Chuyển trạng thái đơn hàng: có khóa
- **Lỗi tuần trước đã sửa:**
  - Báo cáo doanh thu tính hoàn theo `processedAt` (`reports.service.ts:25,58`)
  - Checkout chặn khóa đã hết buổi (`classes/course-sale.ts`, trạng thái `ENDED`)
- **FE:**
  - Không có bí mật trong bundle — chỉ có `VITE_API_BASE_URL`; file env duy nhất được track là `FE/.env.example`
  - Không dùng `dangerouslySetInnerHTML`
  - Refresh-on-401 chỉ một luồng (`shared/api.ts:133-158`)
  - Access token mang `pv`: đổi mật khẩu thì token cũ bị từ chối

### 2.2 Lỗi tìm thấy

| ID | Mức | Vấn đề | Chứng cứ |
|---|---|---|---|
| C1 | 🔴 CRITICAL | `POST /auth/login` (và forgot/reset/refresh) **không rate-limit, không khóa tạm**. Có thể dò mật khẩu tài khoản Manager. App chưa `trust proxy` ⇒ trên Render `req.ip` là IP proxy | [LIVE] 30 lần sai liên tiếp → 30 × `401`, không có `429`. `auth.routes.ts:75`, `auth.service.ts:249-262` |
| C2 | 🔴 CRITICAL (IDOR) | `GET /members/:id` cho **mọi HLV** đọc email, SĐT, ngày sinh của **bất kỳ** hội viên, kể cả hội viên không học mình. Mobile không gọi endpoint này | [LIVE] `coach1` (dạy Yoga) đọc được `member3` (học HIIT của HLV khác): `member3@example.com · 0900000007`. `members.routes.ts:61-65`, `members.service.ts:62-74` |
| C3 | 🔴 CRITICAL | `PATCH /payments/:id/status`: đọc ngoài transaction, `update` không điều kiện trạng thái; `creditCoachWallet` không chống ghi trùng ⇒ 2 request PENDING→SUCCESS đồng thời **cộng ví HLV 2 lần**. Web không gọi API này, nhưng Manager gọi thẳng API được | [CODE] `payments.service.ts:190-226`, `payments.service.ts` `creditCoachWallet` (upsert `increment`) |
| C4 | 🔴 CRITICAL | Giao dịch `REQUIRES_REVIEW` vô hình trên Admin (mục 1.4 #1). BE **lặng lẽ bỏ qua** `?activationStatus=` | [LIVE] `GET /payments?activationStatus=REQUIRES_REVIEW` → 200, không lọc. `payments.schema.ts:59-67`; `RevenuePage.tsx` không có chữ "activation" |
| C5 | 🔴 CRITICAL (sai hợp đồng) | Mobile Manager đọc `/refunds/summary` sai: lấy `pending` như số và `totalPendingAmount`, trong khi BE trả `pending: {count, amount}` ⇒ **luôn hiện 0 hoàn tiền chờ** | [LIVE] BE trả `{"pending":{"count":0,"amount":0}}`, không có `totalPendingAmount`. `manager_api_repository.dart:39-40` |
| S1 | 🟡 | Refresh token không xoay vòng, dùng lại được 7 ngày đến khi logout | [CODE] `auth.service.ts` `refreshAccessToken` chỉ cấp access token |
| S2 | 🟡 | `app.use(cors())` mở mọi origin. Rủi ro thấp vì dùng Bearer, không cookie; nên giới hạn theo `FRONTEND_URL` | [CODE] `app.ts:46` |
| S3 | 🟢 | Upload CV chỉ tin `file.mimetype` do client gửi. Đã giảm rủi ro nhờ tải về với `Content-Type: application/pdf` + `nosniff`; nên kiểm tra magic bytes `%PDF-` | [CODE] `middlewares/upload.ts:143-148`, `coaches.controller.ts:87-89` |
| S4 | 🟢 | Code chết `payments/sepay-payments.controller.ts` (không được import) chứa webhook truyền `rawBody: req.body` — dễ bị nối nhầm, làm hỏng kiểm chữ ký | [CODE] grep không có import |
| S5 | 🟢 | `PaymentQuerySchema.startDate/endDate` là chuỗi tự do; `new Date("YYYY-MM-DD")` thành 00:00 UTC. Web gửi ISO nên không lỗi, client khác có thể mất ngày cuối kỳ | [CODE] `payments.service.ts:147-151` |
| F1 | ✅ | **Double-submit:** mọi dialog chặn submit khi `busy`; 10/10 nút gọi `mutate` trực tiếp đều `disabled` khi pending. **Validate:** form có `invalid` phía client + lỗi theo field từ BE (`fieldErrors`) | [CODE] quét tự động `pages/*.tsx` |

---

## PHẦN 3 — UI/UX Admin (desktop)

| Hạng mục | Hiện trạng | Đánh giá |
|---|---|---|
| Loading | `QueryView` → `Skeleton`; nút mutation đổi nhãn "Đang …" và `disabled`; danh sách dùng `keepPreviousData` (không nháy trắng khi đổi trang) | ✅ |
| Empty | `DataTable` mặc định `EmptyState` "Không có kết quả"; nhiều màn có empty riêng | ✅ |
| Phân trang | Mọi danh sách chính phân trang phía server (`<Pager>` + `page/limit` trên URL). `allPages` chỉ dùng cho tập nhỏ (phòng, buổi của một khóa, xuất CSV) | ✅ — xem U6 |
| Bộ lọc | Trạng thái/vai trò/tìm kiếm có ở hầu hết danh sách. **Đơn hàng, Hoàn tiền, Rút tiền thiếu lọc theo thời gian và tìm theo tên** (BE chưa hỗ trợ) | ⚠️ U4 |
| Lỗi | `ErrorBox` phân biệt 403/404/khác, có Thử lại, lỗi theo field; toast toàn cục trong `api()` | ⚠️ U1, U2, U3 |

Các điểm cần tối ưu:

- **U1:** `ErrorBoundary` chỉ ở cấp App (`app/App.tsx:15`). Một trang lỗi render sẽ thay toàn bộ shell (mất sidebar), dùng CSS cũ (`.fullscreen`, `.button`), không tự hồi phục khi chuyển trang.
- **U2:** `api()` bật toast lỗi cho **mọi** request, kể cả GET (`shared/api.ts:257-283`). Mọi query lại đã có `ErrorBox` inline ⇒ cùng một lỗi hiện 2 lần; Dashboard có 14 query song song.
- **U3:** Xem CV dùng `fetch` trực tiếp (`CoachDetailPage.tsx:145`), bỏ qua refresh-on-401 ⇒ sau ~15 phút luôn báo "Phiên đăng nhập đã hết hạn — tải lại trang".
- **U4:** Đơn hàng / Hoàn tiền / Rút tiền không lọc được theo khoảng ngày, không tìm theo tên khách hoặc HLV (`OrderQuerySchema`, `RefundQuerySchema`, schema ví không có `startDate/endDate/search`).
- **U5:** `DataTable` chưa sắp xếp theo cột (BE cũng chưa có `sortBy`). Tùy chọn.
- **U6:** Bộ lọc khóa học ở Lịch học tải **toàn bộ** `/classes` (`SchedulesPage.tsx:22`). Ổn với dữ liệu hiện tại; khi số khóa lớn nên chuyển sang combobox có tìm kiếm phía server.
- **U7:** `npm run typecheck` lỗi: `CoachDetailPage.tsx:168` khai báo `userId` nhưng không dùng.

---

## PHẦN 4 — Phương án & code mẫu

### [CRITICAL - Bắt buộc sửa]

**C1 — Rate-limit đăng nhập / OTP / refresh** (`BE/src/middlewares/rateLimit.ts`, `BE/src/modules/auth/auth.routes.ts`, `BE/src/app.ts`)

```ts
// BE/src/middlewares/rateLimit.ts — thêm tùy chọn key (giữ nguyên hành vi cũ khi không truyền)
export function rateLimit(opts: { name: string; windowMs: number; max: number; key?: (req: Request) => string }) {
  const hits = new Map<string, number[]>();
  return (req: Request, res: Response, next: NextFunction): void => {
    if (process.env.RATE_LIMIT_DISABLED === "true") return next();
    const key = opts.key?.(req) ?? req.user?.id ?? req.ip ?? "anonymous";
    // … phần còn lại giữ nguyên
  };
}
```

```ts
// BE/src/modules/auth/auth.routes.ts
import { rateLimit } from "../../middlewares/rateLimit.js";

const byIpAndEmail = (req: Request) => `${req.ip}|${String(req.body?.email ?? "").trim().toLowerCase()}`;
const loginLimit = rateLimit({ name: "login", windowMs: 15 * 60_000, max: 10, key: byIpAndEmail });
const loginIpLimit = rateLimit({ name: "login-ip", windowMs: 15 * 60_000, max: 50, key: (req) => req.ip ?? "?" });
const otpLimit = rateLimit({ name: "otp", windowMs: 15 * 60_000, max: 5, key: byIpAndEmail });
const refreshLimit = rateLimit({ name: "refresh", windowMs: 60_000, max: 30, key: (req) => req.ip ?? "?" });

router.post("/login", loginIpLimit, loginLimit, validate(LoginSchema), authController.login);
router.post("/forgot-password", otpLimit, validate(ForgotPasswordSchema), authController.forgotPassword);
router.patch("/reset-password", otpLimit, validate(ResetPasswordSchema), authController.resetPassword);
router.post("/refresh-token", refreshLimit, validate(RefreshTokenSchema), authController.refreshToken);
```

```ts
// BE/src/app.ts — chạy sau proxy của Render: lấy IP thật từ X-Forwarded-For (1 hop)
app.set("trust proxy", 1);
```

> Map trong bộ nhớ chỉ đúng khi chạy 1 instance. Nếu scale ngang, chuyển sang Redis/Postgres.

**C2 — Chặn IDOR `GET /members/:id`** (`BE/src/modules/members/members.routes.ts:61-65`)

```ts
router.get(
  "/:id",
  authenticate, authorize("MANAGER"), // HLV xem học viên của mình qua GET /coaches/me/students/:memberId (đã giới hạn phạm vi)
  membersController.getMemberById
);
```

**C3 — CAS + chống ghi trùng ở `updatePaymentStatus`** (`BE/src/modules/payments/payments.service.ts:190-226`)

```ts
export async function updatePaymentStatus(id: string, status: string) {
  const updated = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id } });
    if (!payment) throw new AppError("Payment not found", 404);
    if (payment.gateway) {
      throw new AppError("Không thể đổi trạng thái thanh toán online thủ công. Giao dịch SePay được chốt qua webhook/đối soát.", 400);
    }
    if (payment.status === status) return payment;
    if (payment.status === "SUCCESS" && status !== "REFUNDED") throw new AppError("A successful payment can only be refunded", 400);
    if (payment.status === "FAILED" || payment.status === "REFUNDED") {
      throw new AppError(`Cannot update payment from ${payment.status} to ${status}`, 400);
    }

    // CAS: chỉ một request thắng; request đồng thời còn lại nhận 409 và KHÔNG chạy fulfill/cộng ví.
    const { count } = await tx.payment.updateMany({
      where: { id, status: payment.status },
      data: { status: status as PaymentStatus, ...(status === "SUCCESS" ? { paidAt: new Date() } : {}) },
    });
    if (count === 0) throw new AppError("Giao dịch vừa được cập nhật bởi thao tác khác. Tải lại để xem trạng thái mới.", 409, { code: "PAYMENT_STATUS_CHANGED" });

    if (status === "SUCCESS" && payment.classId && payment.memberId) {
      const member = await tx.memberProfile.findUniqueOrThrow({ where: { id: payment.memberId }, select: { userId: true } });
      await fulfillCoursePaymentTx(tx, payment, member.userId);
    }
    return payment;
  });
  return getPaymentById(updated.id, { role: "MANAGER" });
}
```

Phòng thủ thêm ở `creditCoachWallet`: trước khi `upsert … increment`, kiểm tra `walletTransaction.findFirst({ where: { paymentId, type: "DEPOSIT" } })`; nếu đã có thì `return`. Tốt nhất thêm unique `(paymentId, type)` cho `WalletTransaction` (cần migration).

**C4 — Hiện và xử lý giao dịch "đã thu – chưa kích hoạt"**

BE (`payments.schema.ts:59-67`, `payments.service.ts:143-146`):

```ts
export const PaymentQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  memberId: z.string().optional(),
  status: z.enum(["PENDING", "SUCCESS", "FAILED", "REFUNDED"]).optional(),
  method: z.enum(["CASH", "BANK_TRANSFER", "SEPAY"]).optional(),
  activationStatus: z.enum(["ACTIVATED", "REQUIRES_REVIEW"]).optional(),
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
});
// listPayments:
if (query.activationStatus) where.activationStatus = query.activationStatus;
```

FE (`FE/src/features/manage/pages/RevenuePage.tsx`):
- thêm `activationStatus: s.value("activation")` vào `filters`
- thêm bộ lọc và cột như dưới
- Dashboard nên có một mục "Cần xử lý" đếm `GET /payments?activationStatus=REQUIRES_REVIEW&limit=1`

```tsx
const retry = useMutation({
  mutationFn: (id: string) => api("POST /payments/{id}/retry-activation", { params: { id } }),
  onSuccess: () => void cache.invalidateQueries({ queryKey: ["admin", "revenue"] }),
});

<Select
  label="Kích hoạt"
  value={s.value("activation")}
  onChange={(v) => s.set({ activation: v })}
  options={[["REQUIRES_REVIEW", "Đã thu – chưa kích hoạt"], ["ACTIVATED", "Đã kích hoạt"]]}
/>

// thêm vào mảng columns của bảng giao dịch
{
  key: "activation",
  title: "Kích hoạt",
  render: (p) =>
    p.activationStatus === "REQUIRES_REVIEW" ? (
      <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
        <Pill tone="warn" >Cần xử lý</Pill>
        <button
          className="cr-btn sm primary"
          disabled={retry.isPending}
          title={str(p.reviewReason) || undefined}
          onClick={() => retry.mutate(str(p.id))}
        >
          {retry.isPending && retry.variables === str(p.id) ? "Đang kích hoạt…" : "Kích hoạt lại"}
        </button>
      </span>
    ) : (
      <span className="cr-muted">—</span>
    ),
},
```

**C5 — Mobile đọc đúng `/refunds/summary`** (`Mobile/lib/features/manager/data/manager_api_repository.dart:39-40`)

```dart
final pending = summary.obj('pending'); // BE: { pending: { count, amount } }
return ApprovalCounts(
  cvs: results[0] as int,
  classes: results[1] as int,
  withdrawals: results[2] as int,
  refunds: pending.integer('count'),
  refundPendingAmount: pending.money('amount'),
);
```

### [MISSING - Cần bổ sung]

**M1 — Màn "Chuyên cần & khiếu nại"**

Tạo `FE/src/features/manage/pages/AttendancePenaltiesPage.tsx`, dùng kit hiện có (thay file cũ `features/manage/AttendancePenalties.tsx` không được route):

```tsx
import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../../shared/api";
import { ConfirmDialog, DataTable, PageHead, Pager, Panel, Pill, QueryView, Select, dateTime, get, str, useUrlState } from "../kit";
import type { Row } from "../kit";

const STATUS: Record<string, [string, "warn" | "bad" | "ok" | ""]> = {
  APPLIED: ["Đang áp dụng", "bad"],
  REVOKED: ["Đã gỡ", "ok"],
  EXPIRED: ["Hết hạn", ""],
};

export default function AttendancePenaltiesPage() {
  const s = useUrlState({ status: "APPLIED" });
  const cache = useQueryClient();
  const [revoking, setRevoking] = useState<Row | null>(null);
  const query = { status: s.value("status"), page: String(s.page), limit: "15" };
  const q = useQuery({
    queryKey: ["admin", "penalties", query],
    queryFn: ({ signal }) => api<Row[]>("GET /attendance/penalties", { query, signal }),
    placeholderData: keepPreviousData,
  });
  const scan = useMutation({
    mutationFn: () => api("POST /attendance/warnings/scan", { body: {} }),
    onSuccess: () => void cache.invalidateQueries({ queryKey: ["admin", "penalties"] }),
  });
  const revoke = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api("POST /attendance/penalties/{id}/revoke", { params: { id }, body: { reason, restoreSlots: true } }),
    onSuccess: () => {
      setRevoking(null);
      void cache.invalidateQueries({ queryKey: ["admin", "penalties"] });
    },
  });

  return (
    <>
      <PageHead
        title="Chuyên cần & khiếu nại"
        desc="Hình phạt do vắng nhiều và khiếu nại hội viên gửi từ ứng dụng."
        actions={
          <button className="cr-btn" disabled={scan.isPending} onClick={() => scan.mutate()}>
            {scan.isPending ? "Đang quét…" : "Quét cảnh báo vắng"}
          </button>
        }
      />
      <Panel flush>
        <div className="cr-toolbar">
          <Select label="Trạng thái" value={s.value("status")} onChange={(v) => s.set({ status: v })} options={Object.entries(STATUS).map(([k, [l]]) => [k, l])} />
        </div>
        <QueryView q={q}>
          {(res) => (
            <>
              <DataTable
                rows={res.data}
                columns={[
                  {
                    key: "m",
                    title: "Hội viên",
                    render: (p) => (
                      <div className="cr-cell-main">
                        <Link to={`/manager/users/${str(get(p, "member.user.id"))}`}>{str(get(p, "member.user.fullName"))}</Link>
                        <small>{str(get(p, "class.name"))}</small>
                      </div>
                    ),
                  },
                  { key: "r", title: "Chuyên cần", className: "num", render: (p) => `${Math.round(Number(p.attendanceRate))}%` },
                  { key: "u", title: "Khóa đặt chỗ đến", className: "nowrap", render: (p) => dateTime(p.blockedUntil) },
                  {
                    key: "a",
                    title: "Khiếu nại",
                    render: (p) =>
                      p.appealedAt ? (
                        <div className="cr-cell-main">
                          <strong title={str(p.appealReason)}>{str(p.appealReason).slice(0, 80)}</strong>
                          <small>{dateTime(p.appealedAt)}</small>
                        </div>
                      ) : (
                        <span className="cr-muted">—</span>
                      ),
                  },
                  { key: "s", title: "Trạng thái", render: (p) => <Pill tone={STATUS[str(p.status)]?.[1] ?? ""}>{STATUS[str(p.status)]?.[0] ?? str(p.status)}</Pill> },
                  {
                    key: "x",
                    title: "",
                    className: "actions",
                    render: (p) =>
                      p.status === "APPLIED" ? (
                        <button className="cr-btn sm" onClick={() => setRevoking(p)}>Gỡ phạt</button>
                      ) : null,
                  },
                ]}
              />
              <Pager meta={res.pagination} onPage={s.setPage} />
            </>
          )}
        </QueryView>
      </Panel>
      {revoking && (
        <ConfirmDialog
          title="Gỡ hình phạt"
          target={`${str(get(revoking, "member.user.fullName"))} · ${str(get(revoking, "class.name"))}`}
          consequence="Hội viên được đặt chỗ lại ngay; các chỗ đã bị hủy do phạt sẽ được khôi phục nếu buổi còn chỗ."
          confirmLabel="Gỡ phạt"
          reason={{ label: "Lý do (lưu vào lịch sử)", required: true, min: 5 }}
          busy={revoke.isPending}
          error={revoke.error}
          onConfirm={(reason) => revoke.mutate({ id: str(revoking.id), reason })}
          onClose={() => setRevoking(null)}
        />
      )}
    </>
  );
}
```

Đăng ký route trong `ManagerLayout.tsx`:

```tsx
const AttendancePenaltiesPage = lazy(() => import("./pages/AttendancePenaltiesPage"));
// NAV, nhóm "Đào tạo": ["attendance", "Chuyên cần & khiếu nại", ClipboardCheck]
<Route path="/manager/attendance" element={<AttendancePenaltiesPage />} />
```

**M2 — Tab "Đánh giá" ở chi tiết HLV** (`CoachDetailPage.tsx`, `profileId = coachProfile.id`)

```tsx
function CoachFeedbackPanel({ profileId }: { profileId: string }) {
  const cache = useQueryClient();
  const [page, setPage] = useState(1);
  const [removing, setRemoving] = useState<Row | null>(null);
  const q = useQuery({
    queryKey: ["admin", "coach-feedbacks", profileId, page],
    queryFn: ({ signal }) =>
      api<{ feedbacks: Row[]; summary: Row }>("GET /feedbacks", { query: { coachId: profileId, page: String(page), limit: "10" }, signal }),
    placeholderData: keepPreviousData,
  });
  const del = useMutation({
    mutationFn: (id: string) => api("DELETE /feedbacks/{id}/manager", { params: { id } }),
    onSuccess: () => {
      setRemoving(null);
      void cache.invalidateQueries({ queryKey: ["admin", "coach-feedbacks", profileId] });
    },
  });
  return (
    <Panel flush title="Đánh giá từ hội viên" desc={q.data ? `TB ${str(get(q.data.data, "summary.averageRating")) || "—"} ★ · ${num(get(q.data.data, "summary.totalFeedbacks"))} đánh giá` : undefined}>
      <QueryView q={q}>
        {(res) => (
          <>
            <DataTable
              rows={res.data.feedbacks}
              empty={<EmptyState title="Chưa có đánh giá" />}
              columns={[
                { key: "r", title: "Điểm", render: (f) => <span aria-label={`${f.rating} sao`}>{"★".repeat(Number(f.rating))}</span> },
                { key: "c", title: "Nhận xét", render: (f) => str(f.comment) || <span className="cr-muted">—</span> },
                { key: "w", title: "Người gửi", render: (f) => (f.isAnonymous ? <span className="cr-muted">Ẩn danh</span> : str(get(f, "member.user.fullName"))) },
                { key: "t", title: "Ngày", className: "nowrap", render: (f) => dateTime(f.createdAt) },
                { key: "x", title: "", className: "actions", render: (f) => <button className="cr-btn sm danger" onClick={() => setRemoving(f)}>Gỡ</button> },
              ]}
            />
            <Pager meta={res.pagination} onPage={setPage} />
          </>
        )}
      </QueryView>
      {removing && (
        <ConfirmDialog
          title="Gỡ đánh giá"
          target={str(removing.comment) || `${removing.rating} sao`}
          consequence="Đánh giá bị xóa khỏi hồ sơ HLV trên ứng dụng và không khôi phục được."
          confirmLabel="Gỡ đánh giá"
          danger
          busy={del.isPending}
          error={del.error}
          onConfirm={() => del.mutate(str(removing.id))}
          onClose={() => setRemoving(null)}
        />
      )}
    </Panel>
  );
}
```

**M3–M6** (theo thứ tự ưu tiên):
- **Báo cáo:** thêm tab "Chuyên cần" và "Hội viên" vào trang Doanh thu → đổi thành "Báo cáo", cùng bộ chọn kỳ, gọi `GET /reports/attendance` và `/reports/members`.
- **Sửa điểm danh:** thêm vào `ScheduleDetailDialog` (`scheduleKit.tsx`) bằng `PUT /attendance/schedule/{scheduleId}` — **cần anh xác nhận** Manager có được sửa điểm danh không.
- **Tồn kho:** tab "Tồn kho" ở Sản phẩm, gọi `GET /shop/manage/inventory`.
- **Push/banner:** cần thiết kế BE trước.

### [UX/UI OPTIMIZATION - Tối ưu trải nghiệm]

**U1 — ErrorBoundary theo trang, giữ shell, tự reset khi đổi route**

```tsx
// FE/src/features/manage/kit.tsx
import { Component } from "react";
export class PageErrorBoundary extends Component<{ resetKey: string; children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="cr-state" role="alert">
        <h3>Trang này gặp lỗi hiển thị</h3>
        <p>Dữ liệu đã lưu không bị ảnh hưởng. Thử tải lại phần này hoặc chuyển sang trang khác.</p>
        <button className="cr-btn primary" onClick={() => this.setState({ error: null })}>Thử lại</button>
      </div>
    );
  }
}

// ManagerLayout.tsx — bọc quanh <Suspense><Routes>…</Routes></Suspense>
<PageErrorBoundary resetKey={pathname}>
  <Suspense fallback={<Skeleton rows={8} />}>
    <Routes>{/* … */}</Routes>
  </Suspense>
</PageErrorBoundary>
```

**U2 — Không toast lỗi cho GET** (`FE/src/shared/api.ts`, nhánh `catch` của `api()`)

```ts
} catch (error) {
  if (error instanceof DOMException && error.name === "AbortError") throw error;
  // Query (GET) đã hiển thị lỗi tại chỗ bằng ErrorBox/QueryView ⇒ chỉ toast cho thao tác ghi.
  if (key.startsWith("GET ")) throw error;
  // … giữ nguyên phần toast hiện tại
}
```

**U3 — Tải file có xác thực, dùng chung cơ chế refresh** (`FE/src/shared/api.ts`)

```ts
/** GET trả Blob (CV PDF…) — 401 thì refresh một lần như api(). */
export async function apiBlob(path: string, signal?: AbortSignal): Promise<Blob> {
  const run = () => fetch(BASE_URL + path, { headers: { Authorization: `Bearer ${accessToken}` }, signal });
  let res = await run();
  if (res.status === 401 && refreshToken) {
    await refresh();
    res = await run();
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.message || "Không tải được tệp.", res.status);
  }
  return res.blob();
}
```

Trong `CoachDetailPage.tsx:145`, thay `fetch(...)` bằng `apiBlob(\`/coaches/${encodeURIComponent(profileId)}/cv/file\`)`.

**U4 — Lọc theo thời gian + tìm kiếm cho Đơn hàng / Hoàn tiền / Rút tiền**

BE, ví dụ hoàn tiền (`refunds.schema.ts`, `refunds.service.ts` `listRefunds`):

```ts
export const RefundQuerySchema = z.object({
  // … giữ nguyên
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
  search: z.string().trim().max(100).optional(),
});
// listRefunds:
if (query.startDate || query.endDate) where.createdAt = { ...(query.startDate && { gte: new Date(query.startDate) }), ...(query.endDate && { lte: new Date(query.endDate) }) };
if (query.search) where.member = { user: { OR: [{ fullName: { contains: query.search, mode: "insensitive" } }, { email: { contains: query.search, mode: "insensitive" } }] } };
```

FE: dùng lại bộ chọn kỳ của Doanh thu (`periodRange`) + `SearchBox` trong `.cr-toolbar`. Gửi ISO `+07:00` như `RevenuePage.tsx:253-256`.

> `Refund` có `createdAt` (ngày yêu cầu) và `processedAt` (ngày xử lý). Với Đơn hàng và giao dịch ví, dùng field ngày tương ứng trong schema Prisma của từng bảng.

**U5 / U6:** sắp xếp cột (cần `sortBy/sortOrder` ở BE) và combobox khóa học có tìm kiếm phía server — làm khi dữ liệu tăng.

**U7 — Sửa typecheck** (`CoachDetailPage.tsx:168`): bỏ `userId` khỏi destructuring và kiểu của `CvPanel` (hoặc dùng nó). Thêm `npm run typecheck` vào CI để không lọt lỗi.

---

## Thứ tự xử lý đề xuất

1. **Bảo mật:** C1 (rate-limit đăng nhập + `trust proxy`) và C2 (1 dòng phân quyền).
2. **Tiền:** C4 (giao dịch cần kích hoạt), C3 (CAS + chống cộng ví trùng).
3. **Đúng số liệu:** C5 (Mobile Manager).
4. **Nghiệp vụ còn hở:** M1 (khiếu nại phạt), M2 (đánh giá HLV).
5. **UX:** U1–U3 (ít công, tác dụng lớn), rồi U4.
