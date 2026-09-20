import { prisma } from "../../config/prisma.js";
import { Prisma } from "@prisma/client";
import { AppError } from "../../middlewares/errorHandler.js";
import { createNotification } from "../notifications/notifications.service.js";

async function verifyCoachOwnership(coachId: string, user: any) {
  if (user.role === "MANAGER" || user.role === "STAFF") return true;
  if (user.role === "COACH") {
    const coachProfile = await prisma.coachProfile.findUnique({ where: { userId: user.id } });
    if (!coachProfile || coachProfile.id !== coachId) {
      throw new AppError("Forbidden: You can only manage your own training plans", 403);
    }
  } else {
    throw new AppError("Forbidden: You do not have permission to manage training plans", 403);
  }
}

export const createPlan = async (data: Prisma.TrainingPlanUncheckedCreateInput, user: any) => {
  await verifyCoachOwnership(data.coachId, user);

  // Check if member is active and role is MEMBER
  const memberProfile = await prisma.memberProfile.findUnique({
    where: { id: data.memberId },
    include: { user: true },
  });
  if (!memberProfile || !memberProfile.user.isActive || memberProfile.user.role !== "MEMBER") {
    throw new AppError("Cannot assign training plan: user is not an active MEMBER", 400);
  }

  const plan = await prisma.trainingPlan.create({

    data,
    include: {
      member: { include: { user: { select: { id: true, fullName: true } } } },
      coach: { include: { user: { select: { fullName: true } } } },
    },
  });

  // Notify member — fire-and-forget
  createNotification(
    plan.member.userId,
    "TRAINING_PLAN_ASSIGNED",
    `HLV đã giao kế hoạch tập luyện mới`,
    `HLV ${plan.coach.user.fullName} đã tạo kế hoạch tập "${plan.name}" cho bạn từ ngày ${new Date(plan.startDate).toLocaleDateString("vi-VN")} đến ${new Date(plan.endDate).toLocaleDateString("vi-VN")}.`,
    { metadata: { planId: plan.id, coachId: plan.coachId } }
  ).catch(() => {});

  return plan;
};


export const getPlans = async (memberId?: string) => {
  return prisma.trainingPlan.findMany({ 
    where: memberId ? { memberId } : undefined,
    include: { coach: { include: { user: true } }, results: true }
  });
};

export const createResult = async (data: Prisma.TrainingResultUncheckedCreateInput, user: any) => {
  const plan = await prisma.trainingPlan.findUnique({ where: { id: data.planId } });
  if (!plan) throw new AppError("Training plan not found", 404);
  
  await verifyCoachOwnership(plan.coachId, user);
  return prisma.trainingResult.create({ data });
};