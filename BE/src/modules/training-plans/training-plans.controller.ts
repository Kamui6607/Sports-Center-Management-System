import { Request, Response, NextFunction } from "express";
import * as service from "./training-plans.service.js";
import * as attachments from "./plan-attachments.service.js";
import { sendSuccess } from "../../utils/response.js";

export const createPlan = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const plan = await service.createPlan(req.body as any, req.user);
    res.status(201).json({ success: true, data: plan });
  } catch (error) { next(error); }
};

export const getPlans = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const plans = await service.getPlans(req.query.memberId as string, req.user!, req.query.classId as string | undefined);
    res.json({ success: true, data: plans });
  } catch (error) { next(error); }
};

export const createResult = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await service.createResult(req.body as any, req.user);
    res.status(201).json({ success: true, data: result });
  } catch (error) { next(error); }
};

export const updateResult = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await service.updateResult(req.params.id as string, req.body, req.user);
    sendSuccess(res, result, "Training result updated successfully");
  } catch (error) { next(error); }
};

export const deleteResult = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await service.deleteResult(req.params.id as string, req.user);
    sendSuccess(res, null, "Training result deleted successfully");
  } catch (error) { next(error); }
};

export const getPlanProgress = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.getPlanProgress(req.params.id as string, req.user!);
    sendSuccess(res, data);
  } catch (error) { next(error); }
};

export const updatePlanCoach = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const plan = await service.updatePlanCoach(
      req.params.id as string,
      req.body.coachId,
      req.user
    );
    sendSuccess(res, plan, "Training plan coach updated successfully");
  } catch (error) { next(error); }
};
export const getPlanById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const plan = await service.getPlanById(req.params.id as string, req.user!);
    sendSuccess(res, plan, "Training plan retrieved");
  } catch (error) {
    next(error);
  }
};

// ── Tệp đính kèm lộ trình (PDF/Excel) ─────────────────────────

export const addPlanAttachment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await attachments.addAttachment(req.params.id as string, req.file, req.user!);
    res.status(201).json({ success: true, message: "Attachment uploaded successfully", data });
  } catch (error) { next(error); }
};

export const listPlanAttachments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    sendSuccess(res, await attachments.listAttachments(req.params.id as string, req.user!), "Attachments retrieved successfully");
  } catch (error) { next(error); }
};

export const downloadPlanAttachment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const f = await attachments.getAttachmentForDownload(req.params.id as string, req.params.attachmentId as string, req.user!);
    res.setHeader("Content-Type", f.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(f.originalName)}`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.sendFile(f.filePath);
  } catch (error) { next(error); }
};

export const deletePlanAttachment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await attachments.deleteAttachment(req.params.id as string, req.params.attachmentId as string, req.user!);
    sendSuccess(res, null, "Attachment deleted successfully");
  } catch (error) { next(error); }
};
