import jwt from "jsonwebtoken";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { COACH_CHECKIN } from "../../config/coach-term.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { lockCoachWallet } from "../../utils/dbLocks.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { vnDateKey } from "../../utils/vnTime.js";
import { enqueueNotification, flushNotificationOutbox } from "../notifications/outbox.service.js";
import { chargeOldestEarnings, settleCheckinDebtTx } from "./checkin-fee.service.js";
import { evaluateCurrentAndPrevious, passVerdict } from "./terms.service.js";

/** Chính sách phí — mặc định lấy từ config; test truyền số khác để không phụ thuộc lịch thật. */
export interface CheckInPolicy {
  freeDaysPerMonth: number;
  feePerDay: number;
}
export const DEFAULT_CHECKIN_POLICY: CheckInPolicy = {
  freeDaysPerMonth: COACH_CHECKIN.FREE_DAYS_PER_MONTH,
  feePerDay: COACH_CHECKIN.FEE_PER_DAY,
};

interface CheckInQrPayload {
  type: "COACH_CHECKIN";
  /** Manager phát hành mã. */
  by: string;
}

const vnd = (n: number) => `${Math.round(n).toLocaleString("vi-VN")}đ`;

// ─── QR do Manager tạo ──────────────────────────────────────────────────────

/** MANAGER: tạo mã QR check-in (JWT sống ~60 giây; trang Web tự đổi mã). */
export function issueCheckInQr(managerUserId: string, now: Date = new Date()) {
  const payload: CheckInQrPayload = { type: "COACH_CHECKIN", by: managerUserId };
  const token = jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: COACH_CHECKIN.QR_TTL_SECONDS });
  return { token, expiresIn: COACH_CHECKIN.QR_TTL_SECONDS, issuedAt: now };
}

function verifyCheckInQr(token: string): CheckInQrPayload {
  let payload: Partial<CheckInQrPayload>;
  try {
    payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as Partial<CheckInQrPayload>;
  } catch (err) {
    if ((err as { name?: string }).name === "TokenExpiredError") {
      throw new AppError("Mã QR check-in đã hết hạn. Hãy quét mã mới đang hiển thị ở quầy.", 400, { code: "CHECKIN_QR_EXPIRED" });
    }
    throw new AppError("Mã QR check-in không hợp lệ.", 400, { code: "CHECKIN_QR_INVALID" });
  }
  if (payload.type !== "COACH_CHECKIN" || typeof payload.by !== "string") {
    throw new AppError("Mã QR check-in không hợp lệ.", 400, { code: "CHECKIN_QR_INVALID" });
  }
  return payload as CheckInQrPayload;
}

// ─── Hạn mức dùng phòng ─────────────────────────────────────────────────────

/** Mức sử dụng trong tháng của một HLV. */
export async function getCheckInUsage(
  coachId: string,
  entitled: boolean,
  now: Date = new Date(),
  policy: CheckInPolicy = DEFAULT_CHECKIN_POLICY
) {
  const dayKey = vnDateKey(now);
  const monthKey = dayKey.slice(0, 7);
  const [rows, wallet, today] = await Promise.all([
    prisma.coachCheckIn.findMany({ where: { coachId, monthKey }, select: { free: true, feeAssessed: true, feeCharged: true } }),
    prisma.coachWallet.findUnique({ where: { coachId }, select: { feeDebt: true } }),
    prisma.coachCheckIn.findUnique({ where: { coachId_dayKey: { coachId, dayKey } }, select: { id: true } }),
  ]);
  const freeDaysUsed = rows.filter((r) => r.free).length;
  return {
    monthKey,
    today: dayKey,
    checkedInToday: !!today,
    daysUsed: rows.length,
    freeDaysUsed,
    freeDaysPerMonth: policy.freeDaysPerMonth,
    /** Còn bao nhiêu ngày miễn phí; thẻ không hợp lệ ⇒ 0 (mọi ngày đều tính phí). */
    freeDaysLeft: entitled ? Math.max(0, policy.freeDaysPerMonth - freeDaysUsed) : 0,
    feePerDay: policy.feePerDay,
    entitled,
    feeAssessedThisMonth: rows.reduce((s, r) => s + Number(r.feeAssessed), 0),
    feeChargedThisMonth: rows.reduce((s, r) => s + Number(r.feeCharged), 0),
    feeDebt: Number(wallet?.feeDebt ?? 0),
  };
}

const CHECKIN_SELECT = {
  id: true,
  dayKey: true,
  monthKey: true,
  checkedInAt: true,
  dayIndex: true,
  free: true,
  feeAssessed: true,
  feeCharged: true,
  feeDebt: true,
  termState: true,
} satisfies Prisma.CoachCheckInSelect;

async function entitlementOf(coachId: string, now: Date) {
  const { currentEval, previousEval } = await evaluateCurrentAndPrevious(coachId, now);
  const verdict = passVerdict(currentEval, previousEval);
  return { entitled: verdict.valid, verdict, termState: currentEval?.state ?? null };
}

async function getEligibleCoach(userId: string) {
  const coach = await prisma.coachProfile.findUnique({
    where: { userId },
    select: { id: true, user: { select: { isActive: true, fullName: true } }, certification: { select: { status: true } } },
  });
  if (!coach) throw new AppError("Không tìm thấy hồ sơ Coach.", 404);
  if (!coach.user.isActive || coach.certification?.status !== "APPROVED") {
    throw new AppError("Hồ sơ Coach chưa được duyệt hoặc tài khoản đang bị khóa.", 403, { code: "CHECKIN_NOT_ELIGIBLE" });
  }
  return coach;
}

// ─── Check-in ───────────────────────────────────────────────────────────────

/**
 * COACH: quét QR check-in ⇒ ghi MỘT ngày dùng phòng (giờ VN). Quét lại trong ngày ⇒ không tính thêm.
 *
 * - Thẻ hợp lệ (đạt/miễn/đang ân hạn, kỳ trước không rớt) và còn hạn mức miễn phí tháng ⇒ miễn phí.
 * - Ngược lại ⇒ phí/ngày, trừ từ tiền ròng của khóa cũ nhất còn dư; thiếu ⇒ ghi nợ trên ví (trừ dần).
 */
export async function coachCheckIn(userId: string, token: string, now: Date = new Date(), policy: CheckInPolicy = DEFAULT_CHECKIN_POLICY) {
  const qr = verifyCheckInQr(token);
  const coach = await getEligibleCoach(userId);
  const dayKey = vnDateKey(now);
  const monthKey = dayKey.slice(0, 7);

  const { entitled, verdict, termState } = await entitlementOf(coach.id, now);
  const wallet = await prisma.coachWallet.upsert({
    where: { coachId: coach.id },
    create: { coachId: coach.id, balance: 0 },
    update: {},
  });

  const outcome = await prisma.$transaction(async (tx) => {
    // Khóa theo ví HLV: hai lần quét song song của cùng một người xếp hàng, lần sau thấy bản ghi của lần trước.
    await lockCoachWallet(tx, wallet.id);
    const dup = await tx.coachCheckIn.findUnique({ where: { coachId_dayKey: { coachId: coach.id, dayKey } }, select: CHECKIN_SELECT });
    if (dup) return { row: dup, already: true as const };

    const [freeUsed, daysUsed] = await Promise.all([
      tx.coachCheckIn.count({ where: { coachId: coach.id, monthKey, free: true } }),
      tx.coachCheckIn.count({ where: { coachId: coach.id, monthKey } }),
    ]);
    const free = entitled && freeUsed < policy.freeDaysPerMonth;
    const fee = free ? 0 : policy.feePerDay;

    // Nợ cũ được ưu tiên trừ trước khi tính phí mới.
    const fresh = await settleCheckinDebtTx(tx, wallet.id);
    let charged = 0;
    let debt = 0;
    if (fee > 0) {
      const res = await chargeOldestEarnings(tx, fresh, fee, `Phí check-in phòng gym ${dayKey}`);
      charged = res.charged;
      debt = res.shortfall;
      if (debt > 0) await tx.coachWallet.update({ where: { id: wallet.id }, data: { feeDebt: { increment: debt } } });
    }
    const row = await tx.coachCheckIn.create({
      data: {
        coachId: coach.id,
        dayKey,
        monthKey,
        checkedInAt: now,
        dayIndex: daysUsed + 1,
        free,
        feeAssessed: fee,
        feeCharged: charged,
        feeDebt: debt,
        termState,
        qrIssuedBy: qr.by,
      },
      select: CHECKIN_SELECT,
    });
    if (fee > 0) {
      await enqueueNotification(tx, {
        userId,
        type: "GENERAL",
        title: "Đã check-in phòng gym",
        body:
          `Ngày ${dayKey.split("-").reverse().join("/")} tính phí ${vnd(fee)}` +
          (charged > 0 ? `, đã trừ ${vnd(charged)} từ ví` : "") +
          (debt > 0 ? `, còn nợ ${vnd(debt)} (trừ dần khi ví có tiền)` : "") +
          ".",
        metadata: { kind: "COACH_CHECKIN_FEE", checkInId: row.id, fee, charged, debt },
      });
    }
    return { row, already: false as const };
  });
  if (!outcome.already && Number(outcome.row.feeAssessed) > 0) void flushNotificationOutbox().catch(() => {});

  const usage = await getCheckInUsage(coach.id, entitled, now, policy);
  return {
    alreadyCheckedIn: outcome.already,
    checkIn: outcome.row,
    pass: verdict,
    usage,
  };
}

/** COACH: mức sử dụng tháng này + các ngày gần đây. */
export async function getMyCheckIns(userId: string, now: Date = new Date(), policy: CheckInPolicy = DEFAULT_CHECKIN_POLICY) {
  const coach = await getEligibleCoach(userId).catch((err) => {
    if (err instanceof AppError && err.statusCode === 403) return null;
    throw err;
  });
  if (!coach) {
    const profile = await prisma.coachProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) throw new AppError("Không tìm thấy hồ sơ Coach.", 404);
    return { eligible: false, usage: await getCheckInUsage(profile.id, false, now, policy), items: [] };
  }
  const { entitled, verdict } = await entitlementOf(coach.id, now);
  const [usage, items] = await Promise.all([
    getCheckInUsage(coach.id, entitled, now, policy),
    prisma.coachCheckIn.findMany({ where: { coachId: coach.id }, select: CHECKIN_SELECT, orderBy: { dayKey: "desc" }, take: 40 }),
  ]);
  return { eligible: true, pass: verdict, usage, items };
}

/** MANAGER: nhật ký check-in (lọc theo ngày / tháng / HLV) + tổng hợp. */
export async function listCheckIns(query: { dayKey?: string; monthKey?: string; coachId?: string; page?: string; limit?: string }) {
  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "20") || 20));
  const where: Prisma.CoachCheckInWhereInput = {
    ...(query.dayKey ? { dayKey: query.dayKey } : {}),
    ...(query.monthKey ? { monthKey: query.monthKey } : {}),
    ...(query.coachId ? { coachId: query.coachId } : {}),
  };
  const [total, rows, agg, free] = await Promise.all([
    prisma.coachCheckIn.count({ where }),
    prisma.coachCheckIn.findMany({
      where,
      select: { ...CHECKIN_SELECT, coach: { select: { id: true, user: { select: { fullName: true, avatarUrl: true } } } } },
      orderBy: { checkedInAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.coachCheckIn.aggregate({ where, _sum: { feeAssessed: true, feeCharged: true, feeDebt: true } }),
    prisma.coachCheckIn.count({ where: { ...where, free: true } }),
  ]);
  return {
    items: rows,
    summary: {
      total,
      free,
      paid: total - free,
      feeAssessed: Number(agg._sum.feeAssessed ?? 0),
      feeCharged: Number(agg._sum.feeCharged ?? 0),
      feeDebt: Number(agg._sum.feeDebt ?? 0),
    },
    policy: DEFAULT_CHECKIN_POLICY,
    pagination: buildPaginationMeta(total, page, limit),
  };
}
