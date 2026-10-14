import { Request, Response, NextFunction } from "express";
import * as membershipsService from "./memberships.service.js";
import { sendSuccess, sendCreated } from "../../utils/response.js";
import type { MembershipQueryInput } from "./memberships.schema.js";

export async function listPlans(_req: Request, res: Response, next: NextFunction) {
  try {
    const plans = await membershipsService.listPlans();
    sendSuccess(res, plans, "Membership plans retrieved successfully");
  } catch (err) { next(err); }
}

export async function createPlan(req: Request, res: Response, next: NextFunction) {
  try {
    const plan = await membershipsService.createPlan(req.body);
    sendCreated(res, plan, "Membership plan created");
  } catch (err) { next(err); }
}

export async function togglePlan(req: Request, res: Response, next: NextFunction) {
  try {
    const plan = await membershipsService.togglePlan(req.params.id as string, req.body?.isActive);
    sendSuccess(res, plan, plan.isActive ? "Membership plan enabled" : "Membership plan disabled");
  } catch (err) { next(err); }
}

export async function purchaseMembership(req: Request, res: Response, next: NextFunction) {
  try {
    const checkout = await membershipsService.purchaseMembership(req.user!.id, req.body.planId);
    sendCreated(res, checkout, "Membership checkout created — waiting for bank transfer");
  } catch (err) { next(err); }
}

export async function getMyMembership(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await membershipsService.getMyMembership(req.user!.id);
    sendSuccess(res, result, "My membership retrieved successfully");
  } catch (err) { next(err); }
}

export async function verifyMembership(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await membershipsService.verifyMembership(req.params.userId as string);
    sendSuccess(res, result, "Membership verified");
  } catch (err) { next(err); }
}

export async function listMemberships(req: Request, res: Response, next: NextFunction) {
  try {
    const { memberships, pagination } = await membershipsService.listMemberships(
      req.query as unknown as MembershipQueryInput
    );
    sendSuccess(res, memberships, "Memberships retrieved successfully", 200, pagination);
  } catch (err) { next(err); }
}
