import { prisma } from "../../config/prisma.js";
import { Prisma } from "@prisma/client";
import { AppError } from "../../middlewares/errorHandler.js";
import { createNotification } from "../notifications/notifications.service.js";
import { ROLE_NAME_SELECT } from "../../utils/roles.js";
import type { ProgressMetric } from "./training-plans.schema.js";

async function verifyCoachOwnership(coachId: string, user: any) {
  if (user.role === "MANAGER") return true;
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
    include: { user: { select: { id: true, isActive: true, role: ROLE_NAME_SELECT } } },
  });
  if (!memberProfile || !memberProfile.user.isActive || memberProfile.user.role.name !== "MEMBER") {
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
  results: { orderBy: { date: "asc" } },
} satisfies Prisma.TrainingPlanInclude;

/**
 * GET /training-plans — PHẠM VI theo actor đăng nhập (KHÔNG tin query từ client):
 * - MANAGER: xem toàn bộ (lọc `memberId` nếu có).
 * - COACH: chỉ plan do CHÍNH mình phụ trách (kết hợp `memberId` nếu có).
 * - MEMBER: chỉ plan của chính mình; truyền `memberId` người khác ⇒ 403.
 */
export const getPlans = async (
  memberId: string | undefined,
  actor: { id: string; role: string }
) => {
  if (actor.role === "MANAGER") {
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

/** Ghi/sửa/xóa mốc tiến độ: CHỈ Coach phụ trách plan (Manager chỉ quản trị nền tảng). */
async function assertPlanCoach(plan: { coachId: string }, user: { id: string; role: string }) {
  if (user.role !== "COACH") throw new AppError("Forbidden: Chỉ Coach phụ trách mới được ghi tiến độ", 403);
  await verifyCoachOwnership(plan.coachId, user);
}

export const createResult = async (
  data: { planId: string; date: string; metrics?: ProgressMetric[]; coachNote?: string },
  user: any
) => {
  const plan = await prisma.trainingPlan.findUnique({ where: { id: data.planId } });
  if (!plan) throw new AppError("Training plan not found", 404);

  await assertPlanCoach(plan, user);
  return prisma.trainingResult.create({
    data: {
      planId: data.planId,
      date: new Date(data.date),
      coachNote: data.coachNote,
      ...(data.metrics ? { metrics: data.metrics as unknown as Prisma.InputJsonValue } : {}),
    },
  });
};

export const updateResult = async (
  id: string,
  data: { date?: string; metrics?: ProgressMetric[]; coachNote?: string },
  user: any
) => {
  const result = await prisma.trainingResult.findUnique({ where: { id }, include: { plan: true } });
  if (!result) throw new AppError("Training result not found", 404);
  await assertPlanCoach(result.plan, user);

  return prisma.trainingResult.update({
    where: { id },
    data: {
      ...(data.date ? { date: new Date(data.date) } : {}),
      ...(data.coachNote !== undefined ? { coachNote: data.coachNote } : {}),
      ...(data.metrics ? { metrics: data.metrics as unknown as Prisma.InputJsonValue } : {}),
    },
  });
};

export const deleteResult = async (id: string, user: any) => {
  const result = await prisma.trainingResult.findUnique({ where: { id }, include: { plan: true } });
  if (!result) throw new AppError("Training result not found", 404);
  await assertPlanCoach(result.plan, user);
  await prisma.trainingResult.delete({ where: { id } });
};

/** Chuẩn hóa `metrics` đã lưu: mảng chuẩn, hoặc object cũ {tên: số} (dữ liệu legacy). */
function normalizeMetrics(raw: unknown): ProgressMetric[] {
  if (Array.isArray(raw)) {
    return raw.filter(
      (m): m is ProgressMetric =>
        !!m && typeof m === "object" && typeof (m as any).name === "string" && typeof (m as any).value === "number"
    );
  }
  if (raw && typeof raw === "object") {
    return Object.entries(raw as Record<string, unknown>)
      .filter(([, v]) => typeof v === "number" && Number.isFinite(v))
      .map(([name, value]) => ({ name, value: value as number }));
  }
  return [];
}

const round = (n: number, digits = 1) => Math.round(n * 10 ** digits) / 10 ** digits;

/**
 * GET /training-plans/:id/progress — các mốc theo thời gian + chênh lệch từng chỉ số (đầu → mới nhất)
 * để Member thấy mình đang tiến bộ. Quyền: MEMBER chủ plan, COACH phụ trách plan, MANAGER (xem).
 */
export const getPlanProgress = async (planId: string, actor: { id: string; role: string }) => {
  const plan = await prisma.trainingPlan.findUnique({
    where: { id: planId },
    include: {
      member: { include: { user: { select: { id: true, fullName: true } } } },
      coach: { include: { user: { select: { id: true, fullName: true } } } },
      results: { orderBy: { date: "asc" } },
    },
  });
  if (!plan) throw new AppError("Training plan not found", 404);

  if (actor.role === "MEMBER") {
    if (plan.member.userId !== actor.id) throw new AppError("Forbidden: You can only view your own progress", 403);
  } else if (actor.role === "COACH") {
    if (plan.coach.userId !== actor.id) throw new AppError("Forbidden: You can only view progress of your own plans", 403);
  } else if (actor.role !== "MANAGER") {
    throw new AppError("Forbidden", 403);
  }

  const checkpoints = plan.results.map((r) => ({
    id: r.id,
    date: r.date,
    coachNote: r.coachNote,
    metrics: normalizeMetrics(r.metrics),
  }));

  // Gom theo tên chỉ số (không phân biệt hoa/thường) qua các mốc đã sắp theo thời gian.
  const series = new Map<string, { name: string; unit?: string; lowerIsBetter: boolean; points: { date: Date; value: number }[] }>();
  for (const cp of checkpoints) {
    for (const m of cp.metrics) {
      const key = m.name.trim().toLowerCase();
      const s = series.get(key) ?? { name: m.name.trim(), unit: m.unit, lowerIsBetter: false, points: [] };
      s.unit = m.unit ?? s.unit;
      s.lowerIsBetter = m.lowerIsBetter ?? s.lowerIsBetter;
      s.points.push({ date: cp.date, value: m.value });
      series.set(key, s);
    }
  }

  const metrics = [...series.values()].map((s) => {
    const first = s.points[0].value;
    const latest = s.points[s.points.length - 1].value;
    const change = round(latest - first, 2);
    const better = s.lowerIsBetter ? change < 0 : change > 0;
    const trend =
      s.points.length < 2 ? "INSUFFICIENT_DATA" : change === 0 ? "UNCHANGED" : better ? "IMPROVED" : "DECLINED";
    return {
      name: s.name,
      unit: s.unit ?? null,
      lowerIsBetter: s.lowerIsBetter,
      first,
      latest,
      change,
      changePercent: first !== 0 ? round((change / Math.abs(first)) * 100) : null,
      trend,
      points: s.points,
    };
  });

  return {
    plan: {
      id: plan.id,
      name: plan.name,
      description: plan.description,
      startDate: plan.startDate,
      endDate: plan.endDate,
      isActive: plan.isActive,
      member: { id: plan.memberId, fullName: plan.member.user.fullName },
      coach: { id: plan.coachId, fullName: plan.coach.user.fullName },
    },
    summary: {
      totalCheckpoints: checkpoints.length,
      firstDate: checkpoints[0]?.date ?? null,
      latestDate: checkpoints[checkpoints.length - 1]?.date ?? null,
      improvedCount: metrics.filter((m) => m.trend === "IMPROVED").length,
      metrics,
    },
    checkpoints,
  };
};

/**
 * Quyền đổi HLV của TrainingPlan:
 * - MEMBER: chỉ plan thuộc hồ sơ của chính mình.
 * - COACH: chỉ plan mình đang phụ trách (reuse verifyCoachOwnership).
 * - MANAGER: giữ nguyên hành vi như verifyCoachOwnership (route chỉ mở cho MANAGER).
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
    include: { user: { select: { id: true, isActive: true, role: ROLE_NAME_SELECT } } },
  });
  if (!newCoach || !newCoach.user.isActive || newCoach.user.role.name !== "COACH") {
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