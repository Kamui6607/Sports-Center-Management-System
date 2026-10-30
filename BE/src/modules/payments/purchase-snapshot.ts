import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { goalLabel } from "../../config/fitness-goals.js";
import type { CourseQuote } from "../classes/course-sale.js";

type DbClient = typeof prisma | Prisma.TransactionClient;

/**
 * Ảnh chụp mặt hàng TẠI THỜI ĐIỂM MUA (`Payment.purchaseSnapshot`) — Doc/GYM_SCOPE_CHANGES.md §6.
 * Lịch sử mua, hóa đơn và thống kê doanh thu đọc snapshot này + `Payment.amount`, nên khi Coach/Manager
 * đổi giá, tên, lịch hay mục tiêu của khóa/gói SAU KHI bán, giao dịch cũ không bị ảnh hưởng.
 */
/** Người bán (trung tâm) & người mua TẠI THỜI ĐIỂM MUA — in trên hóa đơn, không đổi khi thông tin bị sửa sau. */
export interface PartySnapshot {
  seller?: { name: string; address: string; hotline: string | null; email: string | null };
  buyer?: { userId: string; fullName: string; phone: string | null; email: string };
}

/** Bảng tính tiền khóa học lúc mua (Doc/BUSINESS_HARDENING_PLAN.md §2.1). */
export type CoursePricingSnapshot = Omit<CourseQuote, "scheduleIds">;

export interface ClassPurchaseSnapshot extends PartySnapshot {
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
  /** Bảng tính giá (có từ đợt 25/10/2026; giao dịch cũ không có ⇒ coi như mua trọn khóa). */
  pricing?: CoursePricingSnapshot;
  /** Các buổi được tính tiền. */
  scheduleIds?: string[];
  capturedAt: string;
}

export interface MembershipPurchaseSnapshot extends PartySnapshot {
  kind: "MEMBERSHIP";
  planId: string;
  name: string;
  price: number;
  durationDays: number;
  capturedAt: string;
}

/** Ảnh chụp người bán (CenterSetting) + người mua. */
export async function buildPartySnapshot(db: DbClient, buyerUserId: string | null | undefined): Promise<PartySnapshot> {
  const [center, buyer] = await Promise.all([
    db.centerSetting.findUnique({ where: { id: "default" } }),
    buyerUserId
      ? db.user.findUnique({ where: { id: buyerUserId }, select: { id: true, fullName: true, phone: true, email: true } })
      : null,
  ]);
  return {
    ...(center
      ? { seller: { name: center.name, address: center.address, hotline: center.hotline, email: center.email } }
      : {}),
    ...(buyer ? { buyer: { userId: buyer.id, fullName: buyer.fullName, phone: buyer.phone, email: buyer.email } } : {}),
  };
}

export async function buildClassSnapshot(
  db: DbClient,
  classId: string,
  opts: { quote?: CourseQuote; buyerUserId?: string | null } = {}
): Promise<ClassPurchaseSnapshot | null> {
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
  const { scheduleIds, ...pricing } = opts.quote ?? ({} as Partial<CourseQuote>);
  return {
    ...(await buildPartySnapshot(db, opts.buyerUserId)),
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
    ...(opts.quote ? { pricing: pricing as CoursePricingSnapshot, scheduleIds } : {}),
    capturedAt: new Date().toISOString(),
  };
}

export function buildMembershipSnapshot(
  plan: { id: string; name: string; price: unknown; durationDays: number },
  party: PartySnapshot = {}
): MembershipPurchaseSnapshot {
  return {
    ...party,
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

/** Đọc snapshot gói thành viên (null với giao dịch khác). */
export function readMembershipSnapshot(value: unknown): Partial<MembershipPurchaseSnapshot> | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  return v.kind === "MEMBERSHIP" ? (v as Partial<MembershipPurchaseSnapshot>) : null;
}

/** Snapshot giao dịch đơn hàng (dòng hàng đã chụp ở OrderItem — đây chỉ lưu người bán/người mua). */
export async function buildOrderPaymentSnapshot(db: DbClient, orderId: string, buyerUserId: string) {
  return { kind: "ORDER" as const, orderId, ...(await buildPartySnapshot(db, buyerUserId)), capturedAt: new Date().toISOString() };
}
