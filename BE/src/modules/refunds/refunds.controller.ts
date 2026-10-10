import { Request, Response, NextFunction } from "express";
import * as refundsService from "./refunds.service.js";
import { sendSuccess, sendCreated } from "../../utils/response.js";
import type { RefundQueryInput } from "./refunds.schema.js";

export async function requestCourseRefund(req: Request, res: Response, next: NextFunction) {
  try {
    const refund = await refundsService.requestCourseRefund(req.user!.id, req.body.classId, req.body.note);
    sendCreated(res, refund, "Course cancellation requested — waiting for manager approval");
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

export async function approveRefund(req: Request, res: Response, next: NextFunction) {
  try {
    const refund = await refundsService.approveRefund(req.params.id as string, req.user!.id, req.body.note);
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
