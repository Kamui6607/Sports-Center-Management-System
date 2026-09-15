import { Request, Response, NextFunction } from "express";
import * as subsService from "./subscriptions.service.js";
import { sendSuccess, sendCreated } from "../../utils/response.js";

export async function createSubscription(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await subsService.createSubscription(req.body, req.user!.id);
    sendCreated(res, result, "Subscription created successfully");
  } catch (err) { next(err); }
}

export async function renewSubscription(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await subsService.renewSubscription(req.params.id as string, req.body, req.user!.id);
    sendCreated(res, result, "Subscription renewed successfully");
  } catch (err) { next(err); }
}

export async function getMemberSubscriptions(req: Request, res: Response, next: NextFunction) {
  try {
    const { subscriptions, pagination } = await subsService.getMemberSubscriptions(
      req.params.memberId as string,
      req.query
    );
    sendSuccess(res, subscriptions, "Subscriptions retrieved successfully", 200, pagination);
  } catch (err) { next(err); }
}

export async function getSubscriptionById(req: Request, res: Response, next: NextFunction) {
  try {
    const sub = await subsService.getSubscriptionById(req.params.id as string);
    sendSuccess(res, sub, "Subscription retrieved successfully");
  } catch (err) { next(err); }
}

export async function updateSubscriptionStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const sub = await subsService.updateSubscriptionStatus(req.params.id as string, req.body.status);
    sendSuccess(res, sub, "Subscription status updated");
  } catch (err) { next(err); }
}
