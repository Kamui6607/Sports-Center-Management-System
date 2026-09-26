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
 *     summary: Record a payment (auto-creates invoice on SUCCESS)
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [memberId, amount, method]
 *             properties:
 *               memberId: { type: string }
 *               subscriptionId: { type: string }
 *               amount: { type: number }
 *               method: { type: string, enum: [CASH, BANK_TRANSFER] }
 *               status: { type: string, enum: [PENDING, SUCCESS, FAILED] }
 *               note: { type: string }
 *               transactionCode: { type: string }
 *     responses:
 *       201: { $ref: "#/components/responses/PaymentCreated" }
 *       400: { $ref: "#/components/responses/BadRequest" }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.post(
  "/",
  authenticate, authorize("MANAGER", "STAFF"),
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
  authenticate, authorize("MANAGER", "STAFF"),
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
 *     summary: Update payment status
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
 * /payments/sepay/checkout:
 *   post:
 *     summary: Member tạo đơn chuyển khoản VietQR (SePay) để tự mua gói hội viên
 *     description: |
 *       **Thanh toán online qua SePay (chuyển khoản ngân hàng + ảnh VietQR) — Member tự mua gói, không cần quầy.**
 *
 *       Luồng:
 *       1. BE kiểm tra gói + luật đổi gói (chặn hạ hạng / cùng hạng ít ngày hơn) — fail fast.
 *       2. Tạo `Payment` PENDING (`method = SEPAY`, `gateway = SEPAY`, `planId` = gói muốn mua,
 *          `transactionCode` = mã thanh toán riêng, VD `SEVQR12345678` — cũng là nội dung chuyển khoản).
 *       3. Trả ảnh QR động (`qrUrl`) + số tài khoản + số tiền + nội dung CK cho FE hiển thị.
 *       4. Hội viên quét QR / chuyển khoản đúng nội dung → SePay phát hiện giao dịch và gọi
 *          `POST /payments/sepay/webhook` → BE kích hoạt `MembershipSubscription` + `Invoice` + notification.
 *
 *       **Gói CHỈ được kích hoạt khi SePay xác nhận ĐÃ THU TIỀN** — không activate ở bước này.
 *       FE polling `GET /payments/sepay/{id}` để biết trạng thái (PENDING → SUCCESS).
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
 *             required: [planId]
 *             properties:
 *               planId: { type: string, format: uuid, description: "MembershipPlan.id (tier MEMBERSHIP/PREMIUM)" }
 *           example:
 *             planId: "b7f1c0d2-0000-0000-0000-000000000001"
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
 *                 amount: 300000
 *                 currency: VND
 *                 status: PENDING
 *                 gateway: SEPAY
 *                 expiresAt: "2026-09-25T15:30:00.000Z"
 *                 qrUrl: "https://qr.sepay.vn/img?acc=0703339186&bank=SACOMBANK&amount=300000&des=SEVQR12345678&template=compact"
 *                 transferContent: "SEVQR12345678"
 *                 bank: { id: "SACOMBANK", accountNumber: "0703339186", accountHolder: "NGUYEN TRAN TU" }
 *                 plan: { id: "b7f1c0d2-...", name: "Gói Membership 1 tháng", tier: MEMBERSHIP, durationDays: 30 }
 *       400:
 *         description: Gói FREE / user không phải MEMBER đang hoạt động / hạ hạng hoặc giảm số ngày cùng hạng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             examples:
 *               free_plan:
 *                 value: { success: false, message: "Gói FREE không cần thanh toán. Vui lòng chọn gói MEMBERSHIP hoặc PREMIUM." }
 *               downgrade:
 *                 value: { success: false, message: "Không thể mua gói thấp hơn hạng hiện tại. Bạn chỉ có thể nâng cấp." }
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { $ref: "#/components/responses/Forbidden" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       409:
 *         description: Còn giao dịch chuyển khoản PENDING cho cùng gói (chưa quá TTL) — trả kèm QR để FE tiếp tục
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               success: false
 *               message: 'Bạn đang có giao dịch chuyển khoản chờ thanh toán cho gói "Gói Membership 1 tháng". Vui lòng hoàn tất hoặc thử lại sau 14 phút.'
 *               errors:
 *                 code: SEPAY_PAYMENT_PENDING
 *                 gateway: SEPAY
 *                 paymentId: "c1a2b3c4-0000-0000-0000-000000000001"
 *                 orderCode: "SEVQR12345678"
 *                 amount: 300000
 *                 expiresAt: "2026-09-25T15:30:00.000Z"
 *                 qrUrl: "https://qr.sepay.vn/img?acc=0703339186&bank=SACOMBANK&amount=300000&des=SEVQR12345678"
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
 *          `SEPAY_WEBHOOK_SECRET`.
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
 *       7. Hợp lệ ⇒ Payment → `SUCCESS`, tạo `MembershipSubscription` ACTIVE (áp luật hạ hạng + cộng ngày dư),
 *          tạo `Invoice` snapshot (BR-25), gửi notification `PAYMENT_SUCCESS` — TẤT CẢ trong cùng transaction.
 *
 *       Tiền về khi giao dịch đã đóng (hết hạn/thất bại) ⇒ ghi nhận LATE để đối soát, KHÔNG kích hoạt gói.
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
 *       ĐÚNG luồng chốt giao dịch như webhook thật (kích hoạt gói + invoice + notification).
 *
 *       Quyền: MEMBER chỉ xác nhận giao dịch CỦA MÌNH; MANAGER/STAFF được xác nhận hộ (phục vụ demo).
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
 *                 subscriptionId: "d2b3c4d5-0000-0000-0000-000000000001"
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
  authorize("MEMBER", "MANAGER", "STAFF"),
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
 *       mới nhất: `PENDING` (chưa nhận được tiền) → `SUCCESS` (webhook đã xác nhận, gói đã kích hoạt).
 *
 *       Khi `status = SUCCESS` response có thêm `paidAt` + `subscriptionId` (gói đã được kích hoạt tự động).
 *       Quyền: chủ giao dịch (MEMBER) hoặc MANAGER/STAFF; COACH bị chặn.
 *     tags: [Payments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Payment.id nhận được từ `POST /payments/sepay/checkout`
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
 *                     amount: 300000
 *                     currency: VND
 *                     status: PENDING
 *                     gateway: SEPAY
 *                     expiresAt: "2026-09-25T15:30:00.000Z"
 *                     qrUrl: "https://qr.sepay.vn/img?acc=0703339186&bank=SACOMBANK&amount=300000&des=SEVQR12345678&template=compact"
 *                     transferContent: "SEVQR12345678"
 *                     bank: { id: "SACOMBANK", accountNumber: "0703339186", accountHolder: "NGUYEN TRAN TU" }
 *                     paidAt: null
 *                     subscriptionId: null
 *               paid:
 *                 summary: Webhook đã xác nhận — gói được kích hoạt
 *                 value:
 *                   success: true
 *                   message: SePay checkout retrieved successfully
 *                   data:
 *                     paymentId: "c1a2b3c4-0000-0000-0000-000000000001"
 *                     orderCode: "SEVQR12345678"
 *                     amount: 300000
 *                     status: SUCCESS
 *                     paidAt: "2026-09-25T11:08:35.000Z"
 *                     subscriptionId: "d2b3c4d5-0000-0000-0000-000000000001"
 *       401: { $ref: "#/components/responses/Unauthorized" }
 *       403: { description: "Không phải chủ giao dịch / COACH bị chặn" }
 *       404: { $ref: "#/components/responses/NotFound" }
 *       500: { $ref: "#/components/responses/ServerError" }
 */
router.get("/sepay/:id", authenticate, paymentsController.sepayGetCheckout);

export default router;




