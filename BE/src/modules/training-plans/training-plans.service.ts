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
    include: { user: { select: { id: true, isActive: true, role: true } } },
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


/** Field an toàn trả về cho HTTP — TUYỆT ĐỐI không include password/secret của user. */
const planInclude = {
  coach: { include: { user: { select: { id: true, fullName: true } } } },
  results: true,
} satisfies Prisma.TrainingPlanInclude;

/**
 * GET /training-plans — PHẠM VI theo actor đăng nhập (KHÔNG tin query từ client):
 * - MANAGER/STAFF: xem toàn bộ (lọc `memberId` nếu có).
 * - COACH: chỉ plan do CHÍNH mình phụ trách (kết hợp `memberId` nếu có).
 * - MEMBER: chỉ plan của chính mình; truyền `memberId` người khác ⇒ 403.
 */
export const getPlans = async (
  memberId: string | undefined,
  actor: { id: string; role: string }
) => {
  if (actor.role === "MANAGER" || actor.role === "STAFF") {
    return prisma.trainingPlan.findMany({
      where: memberId ? { memberId } : undefined,
      include: planInclude,
    });
  }

  if (actor.role === "COACH") {
    const coachProfile = await prisma.coachProfile.findUnique({ where: { userId: actor.id } });
    if (!coachProfile) throw new AppError("Coach profile not found", 404);
    return prisma.trainingPlan.findMany({
      where: { coachId: coachProfile.id, ...(memberId ? { memberId } : {}) },
      include: planInclude,
    });
  }

  if (actor.role === "MEMBER") {
    const memberProfile = await prisma.memberProfile.findUnique({ where: { userId: actor.id } });
    if (!memberProfile) throw new AppError("Member profile not found", 404);
    if (memberId && memberId !== memberProfile.id) {
      throw new AppError("Forbidden: You can only view your own training plans", 403);
    }
    return prisma.trainingPlan.findMany({
      where: { memberId: memberProfile.id },
      include: planInclude,
    });
  }

  throw new AppError("Forbidden: bạn không có quyền xem kế hoạch tập luyện", 403);
};

export const createResult = async (data: Prisma.TrainingResultUncheckedCreateInput, user: any) => {
  const plan = await prisma.trainingPlan.findUnique({ where: { id: data.planId } });
  if (!plan) throw new AppError("Training plan not found", 404);
  
  await verifyCoachOwnership(plan.coachId, user);
  return prisma.trainingResult.create({ data });
};

/**
 * Quyền đổi HLV của TrainingPlan:
 * - MEMBER: chỉ plan thuộc hồ sơ của chính mình.
 * - COACH: chỉ plan mình đang phụ trách (reuse verifyCoachOwnership).
 * - MANAGER/STAFF: giữ nguyên hành vi như verifyCoachOwnership (route chỉ mở cho MANAGER).
 */
async function verifyPlanCoachChangeAccess(plan: { memberId: string; coachId: string }, user: any) {
  if (user.role === "MEMBER") {
    const memberProfile = await prisma.memberProfile.findUnique({ where: { userId: user.id } });
    if (!memberProfile || memberProfile.id !== plan.memberId) {
      throw new AppError("Forbidden: You can only change the coach of your own training plans", 403);
    }
    return;
  }
  await verifyCoachOwnership(plan.coachId, user);
}

export const updatePlanCoach = async (planId: string, coachId: string, user: any) => {
  const plan = await prisma.trainingPlan.findUnique({
    where: { id: planId },
    include: { member: { include: { user: { select: { id: true, fullName: true } } } } },
  });
  if (!plan) throw new AppError("Training plan not found", 404);

  await verifyPlanCoachChangeAccess(plan, user);

  if (plan.coachId === coachId) {
    throw new AppError("New coach must be different from the current coach", 409);
  }

  // HLV mới phải tồn tại, đang hoạt động và có role COACH.
  const newCoach = await prisma.coachProfile.findUnique({
    where: { id: coachId },
    include: { user: { select: { id: true, isActive: true, role: true } } },
  });
  if (!newCoach || !newCoach.user.isActive || newCoach.user.role !== "COACH") {
    throw new AppError("Active coach not found", 404);
  }

  const previousCoach = await prisma.coachProfile.findUnique({
    where: { id: plan.coachId },
    include: { user: { select: { fullName: true } } },
  });

  // Chỉ cập nhật TrainingPlan.coachId — không đụng enrollment/class/schedule/attendance.
  const updated = await prisma.trainingPlan.update({
    where: { id: planId },
    data: { coachId },
    include: {
      member: { include: { user: { select: { id: true, fullName: true } } } },
      coach: { include: { user: { select: { fullName: true } } } },
    },
  });

  const range = `${new Date(updated.startDate).toLocaleDateString("vi-VN")} – ${new Date(updated.endDate).toLocaleDateString("vi-VN")}`;

  // Hội viên chỉ nhận thông báo khi người khác đổi HLV (không tự thông báo cho chính mình).
  if (user.id !== plan.member.userId) {
    createNotification(
      plan.member.userId,
      "TRAINING_PLAN_ASSIGNED",
      "HLV của kế hoạch tập luyện đã thay đổi",
      `Kế hoạch "${updated.name}" (${range}) giờ do HLV ${updated.coach.user.fullName} phụ trách${
        previousCoach ? ` (trước đó: HLV ${previousCoach.user.fullName})` : ""
      }.`,
      { metadata: { planId, coachId, previousCoachId: plan.coachId } }
    ).catch(() => {});
  }

  // HLV mới cần biết mình vừa được giao kế hoạch.
  createNotification(
    newCoach.userId,
    "TRAINING_PLAN_ASSIGNED",
    "Bạn được phân công kế hoạch tập luyện",
    `Bạn phụ trách kế hoạch "${updated.name}" (${range}) của hội viên ${updated.member.user.fullName}.`,
    { metadata: { planId, memberId: plan.memberId } }
  ).catch(() => {});

  return updated;
};