import { Request, Response, NextFunction } from "express";
import * as enrollmentsService from "./enrollments.service.js";
import { sendSuccess, sendCreated, sendError } from "../../utils/response.js";
import { prisma } from "../../config/prisma.js";

export async function bookClass(req: Request, res: Response, next: NextFunction) {
  try {
    const { scheduleId, memberId: bodyMemberId } = req.body;
    const role = req.user!.role;
    let memberProfileId: string;

    if (role === "MEMBER") {
      // Find own MemberProfile
      const profile = await prisma.memberProfile.findUnique({
        where: { userId: req.user!.id },
      });
      if (!profile) {
        sendError(res, "Member profile not found", 404);
        return;
      }
      memberProfileId = profile.id;
    } else {
      // MANAGER or STAFF must provide memberId
      if (!bodyMemberId) {
        sendError(res, "memberId is required for staff/manager booking", 400);
        return;
      }
      // Accept userId or profileId
      const profile = await prisma.memberProfile.findFirst({
        where: { OR: [{ id: bodyMemberId }, { userId: bodyMemberId }] },
      });
      if (!profile) {
        sendError(res, "Member not found", 404);
        return;
      }
      memberProfileId = profile.id;
    }

    const enrollment = await enrollmentsService.bookClass(scheduleId, memberProfileId, role);
    sendCreated(res, enrollment, "Class booked successfully");
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
