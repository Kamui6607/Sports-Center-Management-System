import { Request, Response, NextFunction } from "express";
import path from "path";
import * as coachService from "./coaches.service.js";
import { sendSuccess, sendCreated } from "../../utils/response.js";
import type { CoachQueryInput, UpdateCoachInput } from "./coaches.schema.js";
import { getCvFile, getMyStudent as getMyStudentService } from "./coach-students.service.js";

export async function listCoaches(req: Request, res: Response, next: NextFunction) {
  try {
    const query = req.query as unknown as CoachQueryInput;
    const { coaches, pagination } = await coachService.listCoaches(query);
    sendSuccess(res, coaches, "Coaches retrieved successfully", 200, pagination);
  } catch (err) {
    next(err);
  }
}

export async function getCoachById(req: Request, res: Response, next: NextFunction) {
  try {
    const coach = await coachService.getCoachById(req.params.id as string);
    sendSuccess(res, coach, "Coach retrieved successfully");
  } catch (err) {
    next(err);
  }
}

export async function updateCoach(req: Request, res: Response, next: NextFunction) {
  try {
    const data = req.body as UpdateCoachInput;
    const actor = { id: req.user!.id, role: req.user!.role };
    const updated = await coachService.updateCoach(req.params.id as string, data, actor);
    sendSuccess(res, updated, "Coach updated successfully");
  } catch (err) {
    next(err);
  }
}

// ── CV upload ─────────────────────────────────────────────────────────────────

export async function submitCV(req: Request, res: Response, next: NextFunction) {
  try {
    const file = (req as any).file;
    if (!file) {
      return next(new (await import("../../middlewares/errorHandler.js")).AppError("No CV file uploaded. Field name must be 'cv'.", 400));
    }
    // Lưu đường dẫn tương đối để phục vụ tĩnh (hoặc qua API tuỳ thiết kế)
    const cvFilePath = path.join("uploads", "cvs", file.filename).replace(/\\/g, "/");
    const result = await coachService.submitCV(req.user!.id, cvFilePath);
    sendCreated(res, result, result.message);
  } catch (err) {
    next(err);
  }
}

export async function reviewCoachCV(req: Request, res: Response, next: NextFunction) {
  try {
    const { action, reason } = req.body as { action: "APPROVE" | "REJECT"; reason?: string };
    const result = await coachService.reviewCoachCV(req.params.profileId as string, action, reason);
    sendSuccess(res, result, result.message);
  } catch (err) {
    next(err);
  }
}

export async function listPendingCoachCVs(req: Request, res: Response, next: NextFunction) {
  try {
    const { coaches, pagination } = await coachService.listPendingCoachCVs(req.query as any);
    sendSuccess(res, coaches, "Coach CVs retrieved successfully", 200, pagination);
  } catch (err) {
    next(err);
  }
}

/** BE-8: tải file CV (PDF) có xác thực. */
export async function downloadCv(req: Request, res: Response, next: NextFunction) {
  try {
    const { filePath, fileName } = await getCvFile(req.params.profileId as string, req.user!);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.sendFile(filePath);
  } catch (err) {
    next(err);
  }
}

/** BE-19: hồ sơ học viên trong các khóa của HLV đang đăng nhập. */
export async function getMyStudent(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await getMyStudentService(req.user!.id, req.params.memberId as string);
    sendSuccess(res, result, "Student retrieved successfully");
  } catch (err) {
    next(err);
  }
}
