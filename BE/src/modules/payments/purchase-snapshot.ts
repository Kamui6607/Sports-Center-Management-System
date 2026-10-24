import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { goalLabel } from "../../config/fitness-goals.js";

type DbClient = typeof prisma | Prisma.TransactionClient;

/**
 * Ảnh chụp mặt hàng TẠI THỜI ĐIỂM MUA (`Payment.purchaseSnapshot`) — Doc/GYM_SCOPE_CHANGES.md §6.
 * Lịch sử mua, hóa đơn và thống kê doanh thu đọc snapshot này + `Payment.amount`, nên khi Coach/Manager
 * đổi giá, tên, lịch hay mục tiêu của khóa/gói SAU KHI bán, giao dịch cũ không bị ảnh hưởng.
 */
export interface ClassPurchaseSnapshot {
  kind: "CLASS";
  classId: string;
  name: string;
  price: number;
  classType: string;
  fitness: string;
  goal: string | null;
  goals: { code: string; label: string }[];
  targetLevel: string | null;
  coach: { id: string; userId: string; fullName: string };
  totalSessions: number;
  startDate: string | null;
  endDate: string | null;
  capturedAt: string;
}

export interface MembershipPurchaseSnapshot {
  kind: "MEMBERSHIP";
  planId: string;
  name: string;
  price: number;
  durationDays: number;
  capturedAt: string;
}

export async function buildClassSnapshot(db: DbClient, classId: string): Promise<ClassPurchaseSnapshot | null> {
  const cls = await db.class.findUnique({
    where: { id: classId },
    select: {
      id: true,
      name: true,
      price: true,
      classType: true,
      fitness: true,
      goal: true,
      goalTags: true,
      targetLevel: true,
      startDate: true,
      endDate: true,
      coach: { select: { id: true, userId: true, user: { select: { fullName: true } } } },
      _count: { select: { schedules: { where: { status: { not: "CANCELLED" }, makeupForId: null } } } },
    },
  });
  if (!cls) return null;
  return {
    kind: "CLASS",
    classId: cls.id,
    name: cls.name,
    price: Number(cls.price),
    classType: cls.classType,
    fitness: cls.fitness,
    goal: cls.goal,
    goals: cls.goalTags.map((code) => ({ code, label: goalLabel(code) })),
    targetLevel: cls.targetLevel,
    coach: { id: cls.coach.id, userId: cls.coach.userId, fullName: cls.coach.user.fullName },
    totalSessions: cls._count.schedules,
    startDate: cls.startDate?.toISOString() ?? null,
    endDate: cls.endDate?.toISOString() ?? null,
    capturedAt: new Date().toISOString(),
  };
}

export function buildMembershipSnapshot(plan: { id: string; name: string; price: unknown; durationDays: number }): MembershipPurchaseSnapshot {
  return {
    kind: "MEMBERSHIP",
    planId: plan.id,
    name: plan.name,
    price: Number(plan.price),
    durationDays: plan.durationDays,
    capturedAt: new Date().toISOString(),
  };
}

/** Đọc snapshot khóa học (null với giao dịch không phải khóa học / dữ liệu cũ thiếu snapshot). */
export function readClassSnapshot(value: unknown): Partial<ClassPurchaseSnapshot> | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  return v.kind === "CLASS" ? (v as Partial<ClassPurchaseSnapshot>) : null;
}
