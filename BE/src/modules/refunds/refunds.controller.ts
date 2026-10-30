import { Request, Response, NextFunction } from "express";
import * as refundsService from "./refunds.service.js";
import { sendSuccess, sendCreated } from "../../utils/response.js";
import type { RefundQueryInput } from "./refunds.schema.js";

export async function requestCourseRefund(req: Request, res: Response, next: NextFunction) {
  try {
    const { classId, note, bankName, bankAccountNumber, bankAccountName, lateRefund } = req.body;
    const result = await refundsService.requestCourseRefund(
      req.user!.id,
      classId,
      note,
      { bankName, bankAccountNumber, bankAccountName },
      { lateRefund: lateRefund === true }
    );
    if (result.mode === "REFUND_REQUESTED") {
      sendCreated(res, result, "Đã gửi yêu cầu hủy khóa — chờ Quản lý duyệt hoàn tiền");
    } else if (result.mode === "LATE_REFUND_REQUESTED") {
      sendCreated(res, result, "Đã hủy khóa và gửi yêu cầu hoàn tiền ngoại lệ — chờ Quản lý xem xét");
    } else {
      sendSuccess(res, result, "Đã hủy khóa — không hoàn tiền (hủy trong vòng 3 ngày trước khai giảng)");
    }
  } catch (err) { next(err); }
}

export async function listMyRefunds(req: Request, res: Response, next: NextFunction) {
  try {
    const { refunds, pagination } = await refundsService.listMyRefunds(
      req.user!.id,
      req.query as unknown as RefundQueryInput
    );
    sendSuccess(res, refunds, "My refunds retrieved successfully", 200, pagination);
  } catch (err) { next(err); }
}

export async function listRefunds(req: Request, res: Response, next: NextFunction) {
  try {
    const { refunds, pagination } = await refundsService.listRefunds(req.query as unknown as RefundQueryInput);
    sendSuccess(res, refunds, "Refunds retrieved successfully", 200, pagination);
  } catch (err) { next(err); }
}

export async function getRefundSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const summary = await refundsService.getRefundSummary();
    sendSuccess(res, summary, "Refund summary retrieved successfully");
  } catch (err) { next(err); }
}

export async function approveRefund(req: Request, res: Response, next: NextFunction) {
  try {
    const refund = await refundsService.approveRefund(
      req.params.id as string,
      req.user!.id,
      req.body.note,
      req.body.transactionRef,
      req.body.feePercent,
      req.body.payoutMethod
    );
    sendSuccess(res, refund, "Refund approved");
  } catch (err) { next(err); }
}

export async function rejectRefund(req: Request, res: Response, next: NextFunction) {
  try {
    const refund = await refundsService.rejectRefund(req.params.id as string, req.user!.id, req.body.reason);
    sendSuccess(res, refund, "Refund rejected");
  } catch (err) { next(err); }
}

export async function getRefundById(req: Request, res: Response, next: NextFunction) {
  try {
    const refund = await refundsService.getRefundById(req.params.id as string, req.user!);
    sendSuccess(res, refund, "Refund retrieved successfully");
  } catch (err) { next(err); }
}

export async function previewCourseRefund(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await refundsService.previewCourseRefund(req.user!.id, String(req.query.classId));
    sendSuccess(res, result, "Course cancellation preview");
  } catch (err) { next(err); }
}

export async function cancelMyRefund(req: Request, res: Response, next: NextFunction) {
  try {
    const refund = await refundsService.cancelMyRefund(req.params.id as string, req.user!);
    sendSuccess(res, refund, "Refund request cancelled");
  } catch (err) { next(err); }
}
