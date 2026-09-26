import { Request, Response, NextFunction } from "express";
import * as purchasesService from "./course-purchases.service.js";
import { sendSuccess, sendCreated } from "../../utils/response.js";

/** POST /course-purchases — MEMBER tự mua, MANAGER mua hộ member. */
export async function purchaseCourse(req: Request, res: Response, next: NextFunction) {
  try {
    const purchase = await purchasesService.purchaseCourse(req.body, {
      id: req.user!.id,
      role: req.user!.role,
    });
    sendCreated(res, purchase, "Course purchased successfully");
  } catch (err) { next(err); }
}

/** GET /course-purchases — MANAGER xem toàn bộ lượt mua + tổng hợp hoa hồng. */
export async function listPurchases(req: Request, res: Response, next: NextFunction) {
  try {
    const { purchases, summary, pagination } = await purchasesService.listPurchases(req.query as any);
    sendSuccess(res, { purchases, summary }, "Course purchases retrieved successfully", 200, pagination);
  } catch (err) { next(err); }
}

/** GET /course-purchases/my — MEMBER xem khóa học đã mua của mình. */
export async function getMyPurchases(req: Request, res: Response, next: NextFunction) {
  try {
    const { purchases, pagination } = await purchasesService.getMyPurchases(req.user!.id, req.query as any);
    sendSuccess(res, purchases, "My course purchases retrieved successfully", 200, pagination);
  } catch (err) { next(err); }
}

/** GET /course-purchases/my-sales — COACH xem lượt mua thuộc khóa mình sở hữu + thu nhập. */
export async function listMySales(req: Request, res: Response, next: NextFunction) {
  try {
    const { purchases, summary, pagination } = await purchasesService.listMySales(req.user!.id, req.query as any);
    sendSuccess(res, { purchases, summary }, "Course sales retrieved successfully", 200, pagination);
  } catch (err) { next(err); }
}

export async function getPurchaseById(req: Request, res: Response, next: NextFunction) {
  try {
    const purchase = await purchasesService.getPurchaseById(req.params.id as string, {
      id: req.user!.id,
      role: req.user!.role,
    });
    sendSuccess(res, purchase, "Course purchase retrieved successfully");
  } catch (err) { next(err); }
}

/** PATCH /course-purchases/:id/cancel — MEMBER tự hủy lượt của mình, MANAGER hủy bất kỳ. */
export async function cancelPurchase(req: Request, res: Response, next: NextFunction) {
  try {
    const purchase = await purchasesService.cancelPurchase(
      req.params.id as string,
      { id: req.user!.id, role: req.user!.role },
      req.body?.reason
    );
    sendSuccess(res, purchase, "Course purchase cancelled successfully");
  } catch (err) { next(err); }
}

/** PATCH /course-purchases/:id/status — MANAGER đổi trạng thái lượt mua. */
export async function updatePurchaseStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const purchase = await purchasesService.updatePurchaseStatus(req.params.id as string, req.body);
    sendSuccess(res, purchase, "Course purchase status updated successfully");
  } catch (err) { next(err); }
}
