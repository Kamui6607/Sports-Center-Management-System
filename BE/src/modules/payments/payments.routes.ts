import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { CreatePaymentSchema, UpdatePaymentStatusSchema, PaymentQuerySchema, SepayCheckoutSchema, SepayMockConfirmSchema, SepayWebhookSchema } from "./payments.schema.js";
import * as paymentsController from "./payments.controller.js";

const router = Router();

/**
 * @swagger
 * /payments:
 *   post:
 *     summary: Ghi nhận thanh toán khóa học tại quầy (Manager only)
 *     description: |
 *       Manager ghi nhận tiền mặt / chuyển khoản tại quầy cho 1 hội viên mua 1 lớp.
 *       Thanh toán online qua VietQR dùng `POST /payments/sepay/checkout`, không dùng endpoint này.
 *
 *       - `memberId`: nhận `MemberProfile.id` hoặc `User.id` của hội viên.
 *       - `classId`: lớp phải ở trạng thái `APPROVED`, nếu không trả 400 `Class is not yet approved`.
 *       - `status` mặc định `SUCCESS`. Khi `SUCCESS`, trong cùng transaction:
 *         ghi danh hội viên vào mọi buổi `SCHEDULED` của lớp,
 *         cộng 85% số tiền vào ví HLV chính của lớp.
 *       - `status = PENDING`: chỉ tạo Payment; chốt sau bằng `PATCH /payments/{id}/status`.
 *       - `amount` phải bằng đúng `Class.price` (lệch ⇒ 400 `AMOUNT_MISMATCH`); lớp giá 0đ ⇒ 400.
 *       - Chỉ ghi danh vào các buổi chưa diễn ra.
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [memberId, amount, method]
 *             properties:
 *               memberId: { type: string, description: "MemberProfile.id hoặc User.id" }
 *               classId: { type: string, description: "Class.id (lớp APPROVED)" }
 *               amount: { type: number, description: "Bằng đúng giá khóa học (VND)" }
 *               method: { type: string, enum: [CASH, BANK_TRANSFER] }
 *               status: { type: string, enum: [PENDING, SUCCESS, FAILED], default: SUCCESS }
 *               note: { type: string }
 *               transactionCode: { type: string }
 *           example:
 *             memberId: "f2a35b9c-ef22-4656-b77a-14d6731793e0"
 *             classId: "class-hiit-001"
 *             amount: 450000
 *             method: CASH
 *             note: "Thu tiền mặt tại quầy"
 *     responses:
 *       201: { $ref: "#/components/responses/PaymentCreated" }
 *       400: { description: "Body không hợp lệ / lớp chưa APPROVED / lớp miễn phí / sai số tiền (AMOUNT_MISMATCH)" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { description: "Không tìm thấy hội viên hoặc lớp" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.post(
  "/",
  authenticate, authorize("MANAGER"),
  validate(CreatePaymentSchema),
  paymentsController.createPayment
);

/**
 * @swagger
 * /payments:
 *   get:
 *     summary: List payments with filters
 *     tags: [Payments]
 *     parameters:
 *       - in: query
 *         name: memberId
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [PENDING, SUCCESS, FAILED, REFUNDED] }
 *       - in: query
 *         name: method
 *         schema: { type: string, enum: [CASH, BANK_TRANSFER, SEPAY] }
 *       - in: query
 *         name: startDate
 *         schema: { type: string }
 *       - in: query
 *         name: endDate
 *         schema: { type: string }
 *     responses:
 *       200: { $ref: "#/components/responses/PaymentListOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get(
  "/",
  authenticate, authorize("MANAGER"),
  validate(PaymentQuerySchema, "query"),
  paymentsController.listPayments
);

/**
 * @swagger
 * /payments/{id}:
 *   get:
 *     summary: Get payment by ID
 *     tags: [Payments]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { $ref: "#/components/responses/PaymentOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get(
  "/:id",
  authenticate,
  paymentsController.getPaymentById
);

/**
 * @swagger
 * /payments/{id}/status:
 *   patch:
 *     summary: Update payment status (thanh toán tại quầy)
 *     description: |
 *       Chỉ áp dụng cho giao dịch ghi nhận TẠI QUẦY (CASH/BANK_TRANSFER — không có `gateway`).
 *       Giao dịch ONLINE (SePay) bị từ chối **400**: trạng thái chỉ được chốt bởi
 *       webhook / đối soát / mock-confirm để không lệch entitlement.
 *     tags: [Payments]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [PENDING, SUCCESS, FAILED, REFUNDED] }
 *     responses:
 *       200: { $ref: "#/components/responses/PaymentOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.patch(
  "/:id/status",
  authenticate, authorize("MANAGER"),
  validate(UpdatePaymentStatusSchema),
  paymentsController.updatePaymentStatus
);

/**
 * @swagger
 * /payments/{id}/retry-activation:
 *   post:
 *     summary: Kích hoạt bù khóa học cho giao dịch SePay đã thu tiền nhưng chưa ghi danh (Manager only)
 *     description: |
 *       Dùng khi `activationStatus = REQUIRES_REVIEW` (tiền ĐÃ về nhưng không ghi danh / cộng ví HLV
 *       tự động được). Chạy lại ghi danh vào các buổi sắp tới + cộng 85% ví HLV chính của lớp,
 *       chuyển `activationStatus = ACTIVATED` và thông báo hội viên.
 *       Đã xử lý rồi (VD 2 Manager bấm cùng lúc) ⇒ 409 `SEPAY_ALREADY_HANDLED`.
 *       - 400: không phải giao dịch SePay / chưa thu tiền / không ở trạng thái REQUIRES_REVIEW / đơn sản phẩm.
 *       - 409: vẫn không kích hoạt được (VD lớp đã bị xóa) — giữ nguyên review, cập nhật lý do.
 *     tags: [Payments]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { $ref: "#/components/responses/PaymentOk" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       409: { $ref: "#/components/responses/Conflict" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.post(
  "/:id/retry-activation",
  authenticate, authorize("MANAGER"),
  paymentsController.retryPaymentActivation
);

/**
 * @swagger
 * /payments/sepay/checkout:
 *   post:
 *     summary: Member tạo đơn chuyển khoản VietQR (SePay) để tự mua khóa học
 *     description: |
 *       **Thanh toán online qua SePay (chuyển khoản ngân hàng + ảnh VietQR) — Member tự mua khóa học, không cần quầy.**
 *       Mua sản phẩm dùng `POST /products/orders`, không dùng endpoint này.
 *
 *       Luồng:
 *       1. BE kiểm tra lớp: đang mở (`isActive`), đã `APPROVED`, giá > 0 — fail fast.
 *       2. Tạo `Payment` PENDING (`method = SEPAY`, `gateway = SEPAY`, `classId`, số tiền = `Class.price`,
 *          `transactionCode` = mã thanh toán riêng, VD `SEVQR12345678` — cũng là nội dung chuyển khoản).
 *       3. Trả ảnh QR động (`qrUrl`) + số tài khoản + số tiền + nội dung CK cho FE hiển thị.
 *       4. Hội viên quét QR / chuyển khoản đúng nội dung → SePay gọi `POST /payments/sepay/webhook`
 *          → BE ghi danh hội viên vào các buổi sắp tới + cộng 85% vào ví HLV chính.
 *
 *       **Chỉ kích hoạt khi SePay xác nhận ĐÃ THU TIỀN** — không kích hoạt ở bước này.
 *       FE polling `GET /payments/sepay/{id}` để biết trạng thái.
 *       Chỉ MEMBER đang hoạt động gọi được (không nhận `memberId` ⇒ không mua hộ người khác).
 *     tags: [Payments]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [classId]
 *             properties:
 *               classId: { type: string, description: "Class.id (lớp APPROVED, giá > 0)" }
 *           example:
 *             classId: "class-hiit-001"
 *     responses:
 *       201:
 *         description: Đơn đã tạo — trả ảnh VietQR + thông tin chuyển khoản
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               success: true
 *               message: SePay checkout created successfully
 *               data:
 *                 paymentId: "c1a2b3c4-0000-0000-0000-000000000001"
 *                 orderCode: "SEVQR12345678"
 *                 amount: 450000
 *                 currency: VND
 *                 status: PENDING
 *                 gateway: SEPAY
 *                 expiresAt: "2026-10-04T15:30:00.000Z"
 *                 qrUrl: "https://qr.sepay.vn/img?acc=0703339186&bank=SACOMBANK&amount=450000&des=SEVQR12345678&template=compact"
 *                 transferContent: "SEVQR12345678"
 *                 bank: { id: "SACOMBANK", accountNumber: "0703339186", accountHolder: "NGUYEN TRAN TU" }
 *                 classInfo: { id: "class-hiit-001", name: "HIIT Cardio" }
 *       400:
 *         description: Lớp chưa APPROVED / lớp miễn phí / user không phải MEMBER đang hoạt động
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             examples:
 *               not_approved:
 *                 value: { success: false, message: "Class is not yet approved" }
 *               free_class:
 *                 value: { success: false, message: "Khóa học miễn phí, không cần thanh toán." }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { description: "Không thấy lớp hoặc lớp đã ngừng (isActive = false)" }
 *       409:
 *         description: Còn giao dịch chuyển khoản PENDING cho cùng lớp (chưa quá TTL) — trả kèm QR để FE tiếp tục
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               success: false
 *               message: 'Bạn đang có giao dịch chuyển khoản chờ thanh toán cho khóa học "HIIT Cardio". Vui lòng hoàn tất hoặc thử lại sau 14 phút.'
 *               errors:
 *                 code: SEPAY_PAYMENT_PENDING
 *                 gateway: SEPAY
 *                 paymentId: "c1a2b3c4-0000-0000-0000-000000000001"
 *                 orderCode: "SEVQR12345678"
 *                 amount: 450000
 *                 expiresAt: "2026-10-04T15:30:00.000Z"
 *                 qrUrl: "https://qr.sepay.vn/img?acc=0703339186&bank=SACOMBANK&amount=450000&des=SEVQR12345678"
 *                 transferContent: "SEVQR12345678"
 *       503: { description: "Chưa cấu hình tài khoản nhận tiền (VIETQR_BANK_ID / VIETQR_ACCOUNT_NO)" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.post(
  "/sepay/checkout",
  authenticate,
  authorize("MEMBER"),
  validate(SepayCheckoutSchema),
  paymentsController.sepayCheckout
);

/**
 * @swagger
 * /payments/sepay/webhook:
 *   post:
 *     summary: SePay gọi server-to-server khi phát hiện giao dịch chuyển khoản
 *     description: |
 *       **Endpoint công khai (KHÔNG Bearer)** — SePay gọi trực tiếp, bảo vệ bằng 1 trong 2
 *       phương thức (chọn ở bước Bảo mật khi tạo webhook trên my.sepay.vn):
 *
 *       1. **HMAC-SHA256** (khuyến nghị): header `X-SePay-Signature: sha256={hex}` +
 *          `X-SePay-Timestamp` (unix seconds) — ký trên `{timestamp}.{rawBody}` bằng
 *          `SEPAY_WEBHOOK_SECRET`. D07: timestamp phải nằm trong cửa sổ
 *          `SEPAY_WEBHOOK_MAX_SKEW_SECONDS` (mặc định **3600s** — phủ retry window ~33 phút của SePay);
 *          chữ ký đúng nhưng timestamp quá cũ ⇒ 401 chống replay (đặt `0` để tắt kiểm tra).
 *       2. **API Key**: header `Authorization: Apikey <SEPAY_WEBHOOK_API_KEY>`.
 *
 *       Request có header chữ ký ⇒ kiểm tra HMAC; không có ⇒ kiểm tra API Key.
 *       Sai/thiếu ⇒ **401** (`SEPAY_INVALID_SIGNATURE` / `SEPAY_INVALID_API_KEY`) và KHÔNG xử lý gì.
 *
 *       Kiểm tra theo thứ tự:
 *       1. Header API key hợp lệ.
 *       2. Là TIỀN VÀO (`transferType = in`) — tiền ra bỏ qua.
 *       3. Mã đơn: `code` (SePay bóc tách theo "Cấu trúc mã thanh toán", VD tiền tố `SEVQR`) hoặc
 *          tự tìm trong `content` ⇒ không khớp đơn nào thì bỏ qua.
 *       4. Số tài khoản nhận tiền (`accountNumber`/`subAccount`) phải khớp `VIETQR_ACCOUNT_NO` ⇒ lệch ghi nhận MISMATCH.
 *       5. Số tiền (`transferAmount`) phải khớp CHÍNH XÁC `Payment.amount` ⇒ lệch ghi nhận MISMATCH.
 *       6. Chống trùng: `payload.id` (sepayId) lưu UNIQUE ở bảng `SepayWebhookEvent` — SePay retry/replay
 *          không xử lý lại; giao dịch đã SUCCESS ⇒ DUPLICATE.
 *       7. Hợp lệ ⇒ chốt giao dịch trong cùng transaction:
 *          - **Lớp học**: ghi danh hội viên vào các buổi sắp tới + cộng 85% vào ví HLV chính, Payment `SUCCESS`
 *            (`activationStatus = ACTIVATED`), notification `PAYMENT_SUCCESS` cho hội viên.
 *          - **Đơn sản phẩm**: Payment `SUCCESS`, `Order` `SUCCESS`, notification `PAYMENT_SUCCESS`.
 *          A06: `Payment.activationStatus` tách khỏi trạng thái tiền — tiền đã thu nhưng không kích hoạt được
 *          (VD lớp đã bị xóa, đơn sản phẩm không còn PENDING) ⇒ `REQUIRES_REVIEW` + `reviewReason` để
 *          quản lý xử lý (`POST /payments/{id}/retry-activation` với lớp học).
 *
 *       Tiền về khi giao dịch đã đóng (hết hạn/thất bại) ⇒ ghi nhận LATE để đối soát, KHÔNG kích hoạt.
 *       Mọi trường hợp (trừ sai API key / chưa cấu hình) đều ACK để SePay không retry vô hạn.
 *
 *       Trả **200** kèm đúng body `{ "success": true }` khi đã ghi nhận xong.
 *     tags: [Payments]
 *     parameters:
 *       - in: header
 *         name: Authorization
 *         required: false
 *         schema: { type: string }
 *         description: "`Apikey <SEPAY_WEBHOOK_API_KEY>` (phương thức API Key)"
 *       - in: header
 *         name: X-SePay-Signature
 *         required: false
 *         schema: { type: string }
 *         description: "`sha256={hex}` — chữ ký HMAC-SHA256 (phương thức HMAC)"
 *       - in: header
 *         name: X-SePay-Timestamp
 *         required: false
 *         schema: { type: string }
 *         description: "Unix timestamp (seconds) khi SePay ký — tham gia nội dung ký"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id, transferType, transferAmount, accountNumber]
 *             properties:
 *               id: { type: integer, description: "ID giao dịch trên SePay — khoá chống trùng" }
 *               gateway: { type: string, description: "Tên ngân hàng, VD SACOMBANK" }
 *               transactionDate: { type: string, description: "YYYY-MM-DD HH:mm:ss (giờ VN)" }
 *               accountNumber: { type: string }
 *               subAccount: { type: string, description: "Số VA nếu có, rỗng nếu không" }
 *               code: { type: string, nullable: true, description: "Mã thanh toán SePay bóc tách được, VD SEVQR12345678" }
 *               content: { type: string, description: "Nội dung chuyển khoản gốc" }
 *               transferType: { type: string, enum: [in, out] }
 *               description: { type: string }
 *               transferAmount: { type: integer }
 *               accumulated: { type: integer }
 *               referenceCode: { type: string }
 *           example:
 *             id: 92704
 *             gateway: "SACOMBANK"
 *             transactionDate: "2026-09-25 11:08:33"
 *             accountNumber: "0703339186"
 *             subAccount: ""
 *             code: "SEVQR12345678"
 *             content: "SEVQR12345678 chuyen tien"
 *             transferType: "in"
 *             description: "NGUYEN VAN A chuyen tien"
 *             transferAmount: 300000
 *             accumulated: 105000000
 *             referenceCode: "FT24012345678"
 *     responses:
 *       200:
 *         description: Đã ghi nhận (SePay không cần retry) — kể cả khi lệch tiền/tài khoản hoặc lặp webhook
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example: { success: true }
 *       400: { description: "Payload không hợp lệ (thiếu id/transferType/transferAmount…)" }
 *       401:
 *         description: Xác thực không hợp lệ (API key sai hoặc chữ ký HMAC sai)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               success: false
 *               message: "Chữ ký webhook SePay không hợp lệ."
 *               errors: { code: SEPAY_INVALID_SIGNATURE, gateway: SEPAY, sepayId: 92704 }
 *       503: { description: "Server chưa cấu hình webhook SePay (SEPAY_WEBHOOK_API_KEY / SEPAY_WEBHOOK_SECRET)" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.post(
  "/sepay/webhook",
  validate(SepayWebhookSchema),
  paymentsController.sepayWebhook
);

/**
 * @swagger
 * /payments/sepay/mock-confirm:
 *   post:
 *     summary: DEV/DEMO — mô phỏng SePay xác nhận đã thu tiền (chỉ khi SEPAY_MOCK_MODE=true)
 *     description: |
 *       Dùng cho môi trường dev/demo/e2e khi KHÔNG có giao dịch ngân hàng thật / SePay không gọi được
 *       webhook vào localhost: tạo đơn bằng `POST /payments/sepay/checkout` rồi gọi endpoint này để chạy
 *       ĐÚNG luồng chốt giao dịch như webhook thật (lớp học: ghi danh + ví HLV; sản phẩm: chốt đơn + notification).
 *
 *       Quyền: MEMBER chỉ xác nhận giao dịch CỦA MÌNH; COACH chỉ xác nhận đơn sản phẩm CỦA MÌNH;
 *       MANAGER được xác nhận hộ (phục vụ demo).
 *       `SEPAY_MOCK_MODE != true` ⇒ 403 `SEPAY_MOCK_DISABLED`.
 *     tags: [Payments]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [paymentId]
 *             properties:
 *               paymentId: { type: string }
 *           example: { paymentId: "c1a2b3c4-0000-0000-0000-000000000001" }
 *     responses:
 *       200:
 *         description: Đã mô phỏng giao dịch chuyển khoản thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               success: true
 *               message: SePay payment simulated successfully
 *               data:
 *                 sepayId: 1927040001
 *                 orderCode: "SEVQR12345678"
 *                 paymentId: "c1a2b3c4-0000-0000-0000-000000000001"
 *                 processed: true
 *                 status: PROCESSED
 *                 paymentStatus: SUCCESS
 *                 mock: true
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { description: "Không phải chủ giao dịch / mock mode đang tắt" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.post(
  "/sepay/mock-confirm",
  authenticate,
  authorize("MEMBER", "COACH", "MANAGER"),
  validate(SepayMockConfirmSchema),
  paymentsController.sepayMockConfirm
);

/**
 * @swagger
 * /payments/sepay/{id}:
 *   get:
 *     summary: Xem trạng thái giao dịch chuyển khoản SePay (FE polling sau khi hội viên CK)
 *     description: |
 *       Trả lại đầy đủ thông tin đơn để FE hiển thị lại QR (kể cả sau khi reload trang) và trạng thái
 *       mới nhất: `PENDING` (chưa nhận được tiền) → `SUCCESS` (đã xác nhận thu tiền).
 *       Đơn còn PENDING và server có cấu hình API SePay ⇒ BE tự đối soát trước khi trả.
 *
 *       Response luôn có `classId` (giao dịch lớp học) hoặc `orderId` (đơn hàng) và `paidAt`.
 *       `activationStatus = REQUIRES_REVIEW` + `requiresReview: true` ⇒ tiền đã về nhưng chưa kích hoạt được,
 *       FE hiển thị "đang đối soát".
 *       Quyền: chủ giao dịch (MEMBER mua lớp; MEMBER/COACH đặt đơn sản phẩm) hoặc MANAGER.
 *     tags: [Payments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Payment.id nhận được từ `POST /payments/sepay/checkout` hoặc `POST /products/orders`
 *     responses:
 *       200:
 *         description: Thông tin đơn + trạng thái hiện tại
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             examples:
 *               pending:
 *                 summary: Chưa nhận được tiền
 *                 value:
 *                   success: true
 *                   message: SePay checkout retrieved successfully
 *                   data:
 *                     paymentId: "c1a2b3c4-0000-0000-0000-000000000001"
 *                     orderCode: "SEVQR12345678"
 *                     amount: 450000
 *                     currency: VND
 *                     status: PENDING
 *                     gateway: SEPAY
 *                     expiresAt: "2026-10-04T15:30:00.000Z"
 *                     qrUrl: "https://qr.sepay.vn/img?acc=0703339186&bank=SACOMBANK&amount=450000&des=SEVQR12345678&template=compact"
 *                     transferContent: "SEVQR12345678"
 *                     bank: { id: "SACOMBANK", accountNumber: "0703339186", accountHolder: "NGUYEN TRAN TU" }
 *                     classInfo: { id: "class-hiit-001", name: "HIIT Cardio" }
 *                     classId: "class-hiit-001"
 *                     orderId: null
 *                     paidAt: null
 *               paid:
 *                 summary: Đơn sản phẩm — webhook đã xác nhận thu tiền
 *                 value:
 *                   success: true
 *                   message: SePay checkout retrieved successfully
 *                   data:
 *                     paymentId: "c1a2b3c4-0000-0000-0000-000000000002"
 *                     orderCode: "SEVQR87654321"
 *                     amount: 850000
 *                     status: SUCCESS
 *                     activationStatus: ACTIVATED
 *                     classId: null
 *                     orderId: "d2b3c4d5-0000-0000-0000-000000000001"
 *                     paidAt: "2026-10-04T11:08:35.000Z"
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { description: "Không phải chủ giao dịch" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get("/sepay/:id", authenticate, paymentsController.sepayGetCheckout);

export default router;




