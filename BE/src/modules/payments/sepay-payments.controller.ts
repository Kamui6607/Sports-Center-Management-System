import { Request, Response } from "express";
import * as sepayService from "./sepay-payments.service.js";
import { AppError } from "../../middlewares/errorHandler.js";

export async function createCheckout(req: Request, res: Response) {
  const userId = req.user!.id;
  const { classId } = req.body;
  if (!classId) throw new AppError("classId is required", 400);

  const checkout = await sepayService.createSepayCheckout(userId, classId);
  res.status(201).json({ success: true, data: checkout });
}

export async function handleWebhook(req: Request, res: Response) {
  await sepayService.handleSepayWebhook({ authHeader: req.headers.authorization, signature: req.headers["x-sepay-signature"] as string, timestamp: req.headers["x-sepay-timestamp"] as string, rawBody: req.body, body: req.body });
  res.json({ success: true });
}

export async function checkTransaction(req: Request, res: Response) {
  const result = await sepayService.getSepayCheckout(req.user!.id, req.user!.role as string, req.params.id as string);
  res.json({ success: true, data: result });
}

