import { Request, Response, NextFunction } from "express";
import * as feedbacksService from "./feedbacks.service.js";
import { sendSuccess, sendCreated } from "../../utils/response.js";

export async function createFeedback(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await feedbacksService.createFeedback(req.body, req.user!.id);
    sendCreated(res, result, "Cảm ơn bạn đã gửi đánh giá!");
  } catch (err) { next(err); }
}

export async function listFeedbacksForCoach(req: Request, res: Response, next: NextFunction) {
  try {
    const { feedbacks, pagination, summary } = await feedbacksService.listFeedbacksForCoach({
      coachId: req.query.coachId as string,
      classId: req.query.classId as string | undefined,
      page: req.query.page as string | undefined,
      limit: req.query.limit as string | undefined,
    });
    sendSuccess(res, { feedbacks, summary }, "Feedbacks retrieved", 200, pagination);
  } catch (err) { next(err); }
}

export async function getMyFeedbacks(req: Request, res: Response, next: NextFunction) {
  try {
    const feedbacks = await feedbacksService.getMyFeedbacks(req.user!.id);
    sendSuccess(res, feedbacks, "My feedbacks retrieved");
  } catch (err) { next(err); }
}

export async function deleteFeedback(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await feedbacksService.deleteFeedback(String(req.params.id), req.user!.id);
    sendSuccess(res, result, "Feedback đã được xóa thành công.");
  } catch (err) { next(err); }
}

export async function deleteFeedbackByManager(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await feedbacksService.deleteFeedbackByManager(String(req.params.id));
    sendSuccess(res, result, "Feedback đã được xóa bởi quản lý.");
  } catch (err) { next(err); }
}
