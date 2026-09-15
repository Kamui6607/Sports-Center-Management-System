import { Request, Response, NextFunction } from "express";
import * as paymentsService from "./payments.service.js";
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
    const payment = await paymentsService.getPaymentById(req.params.id as string);
    sendSuccess(res, payment, "Payment retrieved successfully");
  } catch (err) { next(err); }
}
export async function updatePaymentStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const payment = await paymentsService.updatePaymentStatus(req.params.id as string, req.body.status);
    sendSuccess(res, payment, "Payment status updated");
  } catch (err) { next(err); }
}
