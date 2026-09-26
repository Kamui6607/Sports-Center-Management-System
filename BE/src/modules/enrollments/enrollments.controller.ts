import { Request, Response, NextFunction } from "express";
import * as enrollmentsService from "./enrollments.service.js";
import * as quotaService from "./enrollment-quota.service.js";
import * as courseEnrollmentService from "./course-enrollment.service.js";
import { sendSuccess, sendCreated } from "../../utils/response.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { prisma } from "../../config/prisma.js";

/**
 * Resolve MemberProfile của người được đặt chỗ:
 * - MEMBER  → chính mình;
 * - MANAGER/STAFF → bắt buộc truyền memberId (nhận cả userId hoặc profileId);
 * - COACH   → 403 (không đặt lớp thay hội viên).
 */
async function resolveMemberProfileId(req: Request, bodyMemberId?: string): Promise<string> {
  const role = req.user!.role;

  if (role === "MEMBER") {
    const profile = await prisma.memberProfile.findUnique({ where: { userId: req.user!.id } });
    if (!profile) throw new AppError("Member profile not found", 404);
    return profile.id;
  }

  if (role === "MANAGER" || role === "STAFF") {
    if (!bodyMemberId) throw new AppError("memberId is required for staff/manager booking", 400);
    const profile = await prisma.memberProfile.findFirst({
      where: { OR: [{ id: bodyMemberId }, { userId: bodyMemberId }] },
    });
    if (!profile) throw new AppError("Member not found", 404);
    return profile.id;
  }

  throw new AppError("Forbidden: Coaches cannot book classes for members", 403);
}

export async function bookClass(req: Request, res: Response, next: NextFunction) {
  try {
    const { scheduleId, memberId: bodyMemberId } = req.body;
    const memberProfileId = await resolveMemberProfileId(req, bodyMemberId);
    const enrollment = await enrollmentsService.bookClass(scheduleId, memberProfileId, req.user!.role);
    sendCreated(res, enrollment, "Class booked successfully");
  } catch (err) {
    next(err);
  }
}

/**
 * POST /enrollments/bulk — đăng ký TRỌN KHÓA (tất cả buổi sắp diễn ra của Class).
 * All-or-nothing: 1 buổi không đủ điều kiện ⇒ 409 kèm errors.details[] và KHÔNG tạo buổi nào.
 */
export async function enrollWholeCourse(req: Request, res: Response, next: NextFunction) {
  try {
    const { classId, memberId: bodyMemberId } = req.body;
    const memberProfileId = await resolveMemberProfileId(req, bodyMemberId);
    const result = await courseEnrollmentService.enrollWholeCourse(classId, memberProfileId);
    sendCreated(res, result, "Whole course enrolled successfully");
  } catch (err) {
    next(err);
  }
}

export async function cancelEnrollment(req: Request, res: Response, next: NextFunction) {
  try {
    const enrollment = await enrollmentsService.cancelEnrollment(
      req.params.id as string,
      req.user!.id,
      req.user!.role
    );
    sendSuccess(res, enrollment, "Enrollment cancelled successfully");
  } catch (err) { next(err); }
}

export async function transferEnrollment(req: Request, res: Response, next: NextFunction) {
  try {
    const enrollment = await enrollmentsService.transferEnrollment(
      req.params.id as string,
      req.body.targetScheduleId,
      req.user!.id,
      req.user!.role
    );
    sendSuccess(res, enrollment, "Enrollment transferred successfully");
  } catch (err) { next(err); }
}

export async function getMyEnrollments(req: Request, res: Response, next: NextFunction) {
  try {
    const { enrollments, pagination } = await enrollmentsService.getMyEnrollments(
      req.user!.id,
      req.query
    );
    sendSuccess(res, enrollments, "Enrollments retrieved successfully", 200, pagination);
  } catch (err) { next(err); }
}

export async function getScheduleEnrollments(req: Request, res: Response, next: NextFunction) {
  try {
    const { enrollments, pagination } = await enrollmentsService.getScheduleEnrollments(
      req.params.scheduleId as string,
      req.query
    );
    sendSuccess(res, enrollments, "Schedule enrollments retrieved successfully", 200, pagination);
  } catch (err) { next(err); }
}

/**
 * Quota lớp học song song của CHÍNH member đang đăng nhập (không nhận memberId từ ngoài),
 * nên không thể xem quota của member khác.
 */
export async function getMyQuota(req: Request, res: Response, next: NextFunction) {
  try {
    const quota = await quotaService.getMyConcurrentClassQuota(req.user!.id);
    sendSuccess(res, quota, "Concurrent class quota retrieved successfully");
  } catch (err) { next(err); }
}
