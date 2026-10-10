import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";

type DbClient = typeof prisma | Prisma.TransactionClient;

/**
 * L4 / BE-5 — Điều kiện rút tiền theo TỪNG KHÓA (đúng `PROJECT_OVERVIEW.md` §3.3):
 * tiền (85%) của một khóa chỉ rút được khi khóa đó đã kết thúc (mọi buổi COMPLETED/CANCELLED, không
 * còn buổi SCHEDULED) và không còn yêu cầu hoàn tiền PENDING của khóa. Khóa đang chờ duyệt / đang dạy
 * KHÔNG chặn tiền của khóa khác.
 *
 * - `pendingRefundDebit`: tiền tạm giữ cho các yêu cầu hoàn tiền chờ duyệt (mọi khóa).
 * - `available` = min(số dư − tạm giữ − lệnh rút đang chờ, tiền các khóa đủ điều kiện − tiền đã/đang rút).
 */
export interface WithdrawClassState {
  classId: string;
  className: string;
  classStatus: string;
  /** Doanh thu ròng của khóa trong ví: DEPOSIT − REFUND_DEBIT (đã hoàn tất). */
  netEarned: number;
  pendingRefundDebit: number;
  /** Số buổi còn SCHEDULED (> 0 ⇒ khóa chưa kết thúc). */
  remainingSessions: number;
  /** Khóa đã kết thúc (mọi buổi COMPLETED/CANCELLED hoặc khóa COMPLETED). */
  finished: boolean;
  withdrawable: boolean;
  reason: string | null;
}

export interface WithdrawEligibility {
  balance: number;
  pendingRefundDebit: number;
  pendingWithdrawal: number;
  available: number;
  eligible: boolean;
  blockers: { code: string; message: string }[];
  classes: WithdrawClassState[];
}

const vnd = (n: number) => `${Math.round(n).toLocaleString("vi-VN")}đ`;

export async function computeWithdrawEligibility(
  db: DbClient,
  wallet: { id: string; coachId: string; balance: Prisma.Decimal | number }
): Promise<WithdrawEligibility> {
  const [classes, byType, holds, withdrawals] = await Promise.all([
    db.class.findMany({
      where: { coachId: wallet.coachId },
      select: { id: true, name: true, status: true, schedules: { select: { status: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.walletTransaction.groupBy({
      by: ["classId", "type"],
      where: { walletId: wallet.id, status: "COMPLETED", type: { in: ["DEPOSIT", "REFUND_DEBIT"] } },
      _sum: { amount: true },
    }),
    db.refund.groupBy({
      by: ["classId"],
      where: { coachWalletId: wallet.id, status: "PENDING" },
      _sum: { coachDebitAmount: true },
    }),
    db.walletTransaction.groupBy({
      by: ["status"],
      where: { walletId: wallet.id, type: "WITHDRAWAL", status: { in: ["PENDING", "COMPLETED"] } },
      _sum: { amount: true },
    }),
  ]);

  const net = new Map<string, number>();
  for (const row of byType) {
    if (!row.classId) continue;
    const amount = Number(row._sum.amount ?? 0) * (row.type === "DEPOSIT" ? 1 : -1);
    net.set(row.classId, (net.get(row.classId) ?? 0) + amount);
  }
  const holdByClass = new Map<string, number>();
  let pendingRefundDebit = 0;
  for (const row of holds) {
    const amount = Number(row._sum.coachDebitAmount ?? 0);
    pendingRefundDebit += amount;
    if (row.classId) holdByClass.set(row.classId, amount);
  }
  const withdrawn = (status: string) => Number(withdrawals.find((w) => w.status === status)?._sum.amount ?? 0);
  const pendingWithdrawal = withdrawn("PENDING");
  const completedWithdrawal = withdrawn("COMPLETED");

  const states: WithdrawClassState[] = classes
    .filter((c) => net.has(c.id) || holdByClass.has(c.id))
    .map((c) => {
      const remainingSessions = c.schedules.filter((s) => s.status === "SCHEDULED").length;
      const finished = c.status === "COMPLETED" || (c.schedules.length > 0 && remainingSessions === 0);
      const hold = holdByClass.get(c.id) ?? 0;
      const reason = !finished
        ? `Khóa chưa kết thúc (còn ${remainingSessions} buổi).`
        : hold > 0
          ? `Đang tạm giữ ${vnd(hold)} cho yêu cầu hoàn tiền chờ duyệt.`
          : null;
      return {
        classId: c.id,
        className: c.name,
        classStatus: c.status,
        netEarned: Math.max(0, net.get(c.id) ?? 0),
        pendingRefundDebit: hold,
        remainingSessions,
        finished,
        withdrawable: reason === null,
        reason,
      };
    });

  const balance = Number(wallet.balance);
  const eligibleEarned = states.filter((s) => s.withdrawable).reduce((sum, s) => sum + s.netEarned, 0);
  const available = Math.max(
    0,
    Math.min(balance - pendingRefundDebit - pendingWithdrawal, eligibleEarned - completedWithdrawal - pendingWithdrawal)
  );

  const blockers: { code: string; message: string }[] = [];
  if (pendingWithdrawal > 0) {
    blockers.push({
      code: "WITHDRAWAL_PENDING",
      message: `Lệnh rút ${vnd(pendingWithdrawal)} đang chờ Quản lý duyệt.`,
    });
  }
  if (!states.some((s) => s.withdrawable)) {
    const heldFinished = states.some((s) => s.finished && s.pendingRefundDebit > 0);
    blockers.push(
      heldFinished
        ? {
            code: "BALANCE_HELD_FOR_REFUND",
            message: `Khóa đã kết thúc đang có yêu cầu hoàn tiền chờ duyệt (tạm giữ ${vnd(pendingRefundDebit)}).`,
          }
        : {
            code: "CLASS_NOT_COMPLETED",
            message: "Chưa có khóa học nào kết thúc để rút tiền (tiền của khóa chỉ rút được khi khóa đã kết thúc).",
          }
    );
  } else if (available <= 0 && pendingWithdrawal === 0) {
    blockers.push({
      code: pendingRefundDebit > 0 ? "BALANCE_HELD_FOR_REFUND" : "NO_AVAILABLE_BALANCE",
      message:
        pendingRefundDebit > 0
          ? `Số dư đang tạm giữ ${vnd(pendingRefundDebit)} cho yêu cầu hoàn tiền chờ duyệt.`
          : "Tiền của các khóa đã kết thúc đã được rút hết.",
    });
  }

  return {
    balance,
    pendingRefundDebit,
    pendingWithdrawal,
    available,
    eligible: blockers.length === 0 && available > 0,
    blockers,
    classes: states,
  };
}
