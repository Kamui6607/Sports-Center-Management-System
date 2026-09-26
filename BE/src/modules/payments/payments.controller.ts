import { Request, Response, NextFunction } from "express";
import * as paymentsService from "./payments.service.js";
import * as sepayPaymentsService from "./sepay-payments.service.js";
import { sendSuccess, sendCreated } from "../../utils/response.js";

export async function createPayment(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await paymentsService.createPayment(req.body, req.user!.id);
    sendCreated(res, result, "Payment recorded successfully");
  } catch (err) { next(err); }
}
export async function listPayments(req: Request, res: Response, next: NextFunction) {
  try {
    const { payments, pagination } = await paymentsService.listPayments(req.query);
    sendSuccess(res, payments, "Payments retrieved successfully", 200, pagination);
  } catch (err) { next(err); }
}
export async function getPaymentById(req: Request, res: Response, next: NextFunction) {
  try {
    const payment = await paymentsService.getPaymentById(req.params.id as string, req.user);
    sendSuccess(res, payment, "Payment retrieved successfully");
  } catch (err) { next(err); }
}
export async function updatePaymentStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const payment = await paymentsService.updatePaymentStatus(req.params.id as string, req.body.status);
    sendSuccess(res, payment, "Payment status updated");
  } catch (err) { next(err); }
}

/**
 * POST /payments/sepay/checkout — MEMBER tạo giao dịch chuyển khoản VietQR để tự mua gói.
 * Chỉ trả ảnh QR + số tài khoản + số tiền + nội dung CK; gói CHỈ được kích hoạt khi SePay
 * gửi webhook xác nhận (hoặc mock-confirm ở môi trường dev).
 */
export async function sepayCheckout(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await sepayPaymentsService.createSepayCheckout(req.user!.id, req.body.planId);
    sendCreated(res, result, "SePay checkout created successfully");
  } catch (err) { next(err); }
}

/**
 * POST /payments/sepay/webhook — SePay gọi server-to-server (không auth của app).
 * Xác thực theo cấu hình trên my.sepay.vn:
 * - API Key: header `Authorization: Apikey <SEPAY_WEBHOOK_API_KEY>`, hoặc
 * - HMAC-SHA256: header `X-SePay-Signature: sha256={hex}` + `X-SePay-Timestamp`
 *   ký trên raw body bằng `SEPAY_WEBHOOK_SECRET`.
 * Trả 200 `{ success: true }` khi đã ghi nhận xong để SePay không retry.
 */
export async function sepayWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    const header = (name: string): string | undefined => {
      const value = req.headers[name];
      return (Array.isArray(value) ? value[0] : value) ?? undefined;
    };
    const outcome = await sepayPaymentsService.handleSepayWebhook({
      authHeader: req.headers.authorization,
      signature: header("x-sepay-signature"),
      timestamp: header("x-sepay-timestamp"),
      rawBody: (req as Request & { rawBody?: Buffer }).rawBody,
      body: req.body,
    });
    console.log(
      `[SEPAY WEBHOOK] sepayId=${outcome.sepayId} order=${outcome.orderCode ?? "-"} ` +
        `status=${outcome.status} processed=${outcome.processed}` +
        (outcome.reason ? ` reason=${outcome.reason}` : "")
    );
    // SePay chỉ tính là thành công khi HTTP 200/201 + body JSON có success: true.
    res.status(200).json({ success: true });
  } catch (err) { next(err); }
}

/** POST /payments/sepay/mock-confirm — DEV/DEMO: mô phỏng SePay xác nhận đã thu tiền. */
export async function sepayMockConfirm(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await sepayPaymentsService.mockConfirmSepayPayment(
      req.user!.id,
      req.user!.role,
      req.body.paymentId
    );
    sendSuccess(res, result, "SePay payment simulated successfully");
  } catch (err) { next(err); }
}

/**
 * GET /payments/sepay/:id — FE polling trạng thái giao dịch (QR + status + subscriptionId).
 * Dùng sau khi hội viên chuyển khoản để biết gói đã được kích hoạt hay chưa.
 */
export async function sepayGetCheckout(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await sepayPaymentsService.getSepayCheckout(
      req.user!.id,
      req.user!.role,
      req.params.id as string
    );
    sendSuccess(res, result, "SePay checkout retrieved successfully");
  } catch (err) { next(err); }
}
