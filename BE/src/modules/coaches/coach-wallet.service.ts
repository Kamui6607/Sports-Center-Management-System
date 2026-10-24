import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { createNotification } from "../notifications/notifications.service.js";
import { lockCoachWallet } from "../../utils/dbLocks.js";
import { computeWithdrawEligibility } from "./wallet-eligibility.service.js";
import { settleCheckinDebt } from "../terms/checkin-fee.service.js";

/** Số ngày tối đa từ khi class COMPLETED mà coach được phép rút tiền. 0 = không giới hạn. */
const WITHDRAWAL_ALLOWED_AFTER_CLASS_COMPLETED = true;

/**
 * Lấy thông tin ví của coach đang login.
 * Coach chỉ xem được ví của chính mình; Manager xem được của bất kỳ coach nào.
 */
export async function getMyWallet(coachUserId: string) {
  const coachProfile = await prisma.coachProfile.findUnique({
    where: { userId: coachUserId },
    include: {
      wallet: true,
      user: { select: { fullName: true, email: true } },
    },
  });
  if (!coachProfile) throw new AppError("Coach profile not found", 404);

  let wallet =
    coachProfile.wallet ?? (await prisma.coachWallet.create({ data: { coachId: coachProfile.id, balance: 0 } }));
  // Phí check-in còn nợ: trừ dần khi ví đã có tiền ròng (best-effort — lỗi không chặn việc xem ví).
  if (Number(wallet.feeDebt) > 0) {
    wallet = (await settleCheckinDebt(wallet.id).catch(() => null)) ?? wallet;
  }
  // BE-5 / L4: tiền tạm giữ, số dư khả dụng và điều kiện rút theo từng khóa.
  const eligibility = await computeWithdrawEligibility(prisma, wallet);

  return {
    wallet,
    coach: { fullName: coachProfile.user.fullName, email: coachProfile.user.email },
    pendingRefundDebit: eligibility.pendingRefundDebit,
    pendingWithdrawal: eligibility.pendingWithdrawal,
    checkinDebt: eligibility.checkinDebt,
    available: eligibility.available,
    withdrawEligibility: {
      eligible: eligibility.eligible,
      blockers: eligibility.blockers,
      classes: eligibility.classes,
    },
  };
}

export async function getCoachWalletByCoachId(coachProfileId: string) {
  const wallet = await prisma.coachWallet.findUnique({
    where: { coachId: coachProfileId },
    include: {
      coach: {
        include: { user: { select: { fullName: true, email: true } } },
      },
    },
  });
  if (!wallet) throw new AppError("Coach wallet not found", 404);
  return wallet;
}

/**
 * Lấy lịch sử giao dịch ví của coach đang login.
 */
export async function getMyWalletTransactions(coachUserId: string, query: any) {
  const coachProfile = await prisma.coachProfile.findUnique({
    where: { userId: coachUserId },
    include: { wallet: true },
  });
  if (!coachProfile) throw new AppError("Coach profile not found", 404);

  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "10") || 10));
  // HLV chưa có ví (chưa tạo khóa nào) ⇒ danh sách rỗng thay vì 404 (đồng nhất với GET /me/wallet tự tạo ví).
  if (!coachProfile.wallet) return { transactions: [], pagination: buildPaginationMeta(0, page, limit) };
  const skip = (page - 1) * limit;

  const where: any = { walletId: coachProfile.wallet.id };
  if (query.type) where.type = query.type;
  if (query.status) where.status = query.status;

  const [total, transactions] = await Promise.all([
    prisma.walletTransaction.count({ where }),
    prisma.walletTransaction.findMany({
      where, skip, take: limit,
      include: { class: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return { transactions, pagination: buildPaginationMeta(total, page, limit) };
}

/**
 * Coach yêu cầu rút tiền khỏi ví.
 *
 * Điều kiện:
 * 1. Số dư đủ (balance >= amount).
 * 2. Tất cả schedule của class nguồn (classId) phải COMPLETED.
 *    → Hoặc không cần classId nếu rút từ balance tổng (tất cả class đã COMPLETED rồi).
 * 3. Không có yêu cầu rút đang PENDING.
 */
export async function requestWithdrawal(coachUserId: string, data: {
  amount: number;
  bankInfo: object;
  note?: string;
}) {
  const coachProfile = await prisma.coachProfile.findUnique({
    where: { userId: coachUserId },
    include: {
      wallet: true,
      user: { select: { id: true, fullName: true } },
    },
  });
  if (!coachProfile) throw new AppError("Coach profile not found", 404);

  if (!coachProfile.wallet) throw new AppError("Coach wallet not found. Please create a class first.", 404);

  let wallet = coachProfile.wallet;
  // Trừ nợ phí check-in (nếu có) trước khi tính số dư khả dụng để rút.
  if (Number(wallet.feeDebt) > 0) wallet = (await settleCheckinDebt(wallet.id).catch(() => null)) ?? wallet;

  if (data.amount <= 0) throw new AppError("Amount must be positive", 400);
  if (Number(wallet.balance) < data.amount) {
    throw new AppError(
      `Số dư không đủ. Ví hiện có ${Number(wallet.balance).toLocaleString("vi-VN")}đ, bạn yêu cầu rút ${data.amount.toLocaleString("vi-VN")}đ.`,
      400,
      { code: "INSUFFICIENT_BALANCE", balance: Number(wallet.balance), requested: data.amount }
    );
  }

  // L4: chỉ tiền của các khóa ĐÃ KẾT THÚC (không còn hoàn tiền chờ duyệt) mới rút được.
  const eligibility = await computeWithdrawEligibility(prisma, wallet);
  const pendingWithdrawal = await prisma.walletTransaction.findFirst({
    where: { walletId: wallet.id, type: "WITHDRAWAL", status: "PENDING" },
  });
  if (pendingWithdrawal) {
    throw new AppError(
      "Bạn đang có yêu cầu rút tiền chờ xử lý. Vui lòng chờ Manager duyệt trước khi tạo yêu cầu mới.",
      409,
      { code: "WITHDRAWAL_PENDING", transactionId: pendingWithdrawal.id }
    );
  }
  if (!eligibility.classes.some((c) => c.withdrawable)) {
    const blocker = eligibility.blockers.find((b) => b.code !== "WITHDRAWAL_PENDING");
    throw new AppError(
      blocker?.message ?? "Chưa có khóa học nào kết thúc để rút tiền.",
      400,
      { code: blocker?.code ?? "CLASS_NOT_COMPLETED", classes: eligibility.classes }
    );
  }
  if (data.amount > eligibility.available) {
    const held = eligibility.pendingRefundDebit > 0;
    throw new AppError(
      `Số tiền rút được hiện chỉ còn ${eligibility.available.toLocaleString("vi-VN")}đ` +
        (held ? ` (đang tạm giữ ${eligibility.pendingRefundDebit.toLocaleString("vi-VN")}đ cho yêu cầu hoàn tiền chờ duyệt).` : "."),
      400,
      {
        code: held ? "BALANCE_HELD_FOR_REFUND" : "AMOUNT_EXCEEDS_AVAILABLE",
        balance: eligibility.balance,
        pendingRefundDebit: eligibility.pendingRefundDebit,
        available: eligibility.available,
      }
    );
  }

  const transaction = await prisma.walletTransaction.create({
    data: {
      walletId: wallet.id,
      amount: data.amount,
      type: "WITHDRAWAL",
      status: "PENDING",
      bankInfo: data.bankInfo as any,
      note: data.note ?? "Yêu cầu rút tiền",
    },
  });

  // Thông báo Manager có yêu cầu rút tiền mới
  const managers = await prisma.user.findMany({
    where: { role: { name: "MANAGER" }, isActive: true },
    select: { id: true },
  });
  const coachName = coachProfile.user?.fullName ?? "Coach";
  for (const manager of managers) {
    createNotification(
      manager.id,
      "GENERAL",
      "Yêu cầu rút tiền mới",
      `Coach ${coachName} yêu cầu rút ${data.amount.toLocaleString("vi-VN")}đ từ ví.`
    ).catch(() => {});
  }

  return transaction;
}

/**
 * Manager duyệt hoặc từ chối yêu cầu rút tiền.
 * APPROVED: trừ balance, chuyển status COMPLETED.
 * REJECTED: không thay đổi balance, chuyển status REJECTED.
 */
export async function reviewWithdrawal(
  transactionId: string,
  action: "APPROVE" | "REJECT",
  reason?: string,
  transactionRef?: string
) {
  const txRecord = await prisma.walletTransaction.findUnique({
    where: { id: transactionId },
    include: {
      wallet: {
        include: {
          coach: {
            include: { user: { select: { id: true, fullName: true } } },
          },
        },
      },
    },
  });

  if (!txRecord) throw new AppError("Wallet transaction not found", 404);
  if (txRecord.type !== "WITHDRAWAL") throw new AppError("Transaction is not a withdrawal", 400);
  if (txRecord.status !== "PENDING") {
    throw new AppError(`Transaction is already ${txRecord.status}`, 400);
  }

  const amount = Number(txRecord.amount);
  const result = await prisma.$transaction(async (db) => {
    // F-07: hai lần duyệt (hoặc duyệt rút song song duyệt hoàn tiền trừ ví) xếp hàng theo ví, rồi đọc lại SAU lock.
    await lockCoachWallet(db, txRecord.walletId);
    const fresh = await db.walletTransaction.findUnique({ where: { id: transactionId }, select: { status: true } });
    if (fresh?.status !== "PENDING") {
      throw new AppError("Lệnh rút đã được xử lý bởi thao tác khác, vui lòng tải lại.", 409, {
        code: "WITHDRAWAL_ALREADY_PROCESSED",
        status: fresh?.status,
      });
    }

    if (action === "APPROVE") {
      const wallet = await db.coachWallet.findUnique({ where: { id: txRecord.walletId } });
      if (!wallet) throw new AppError("Wallet not found", 404);
      // Giữ chính sách tạm giữ: tiền đang chờ hoàn cho hội viên không được chi cho HLV.
      const holds = await db.refund.aggregate({
        where: { coachWalletId: wallet.id, status: "PENDING" },
        _sum: { coachDebitAmount: true },
      });
      const held = Number(holds._sum.coachDebitAmount ?? 0);
      if (Number(wallet.balance) - held < amount) {
        throw new AppError(
          held > 0
            ? `Số dư ví không đủ để duyệt: đang tạm giữ ${held.toLocaleString("vi-VN")}đ cho yêu cầu hoàn tiền chờ duyệt.`
            : "Số dư ví không đủ để duyệt yêu cầu này",
          400,
          { code: held > 0 ? "BALANCE_HELD_FOR_REFUND" : "INSUFFICIENT_BALANCE", balance: Number(wallet.balance), held, amount }
        );
      }
      const ref = transactionRef?.trim();
      const done = await db.walletTransaction.updateMany({
        where: { id: transactionId, status: "PENDING" },
        data: {
          status: "COMPLETED",
          note: [reason ? `Đã duyệt. ${reason}` : "Đã duyệt và chuyển tiền", ref ? `[Mã GD: ${ref}]` : ""].filter(Boolean).join(" "),
        },
      });
      if (done.count !== 1) throw new AppError("Lệnh rút đã được xử lý bởi thao tác khác, vui lòng tải lại.", 409, { code: "WITHDRAWAL_ALREADY_PROCESSED" });
      await db.coachWallet.update({
        where: { id: txRecord.walletId },
        data: { balance: { decrement: amount } },
      });
    } else {
      const done = await db.walletTransaction.updateMany({
        where: { id: transactionId, status: "PENDING" },
        data: {
          status: "REJECTED",
          note: reason ? `Bị từ chối: ${reason}` : "Bị từ chối",
        },
      });
      if (done.count !== 1) throw new AppError("Lệnh rút đã được xử lý bởi thao tác khác, vui lòng tải lại.", 409, { code: "WITHDRAWAL_ALREADY_PROCESSED" });
    }

    return db.walletTransaction.findUnique({ where: { id: transactionId } });
  });

  // Thông báo coach biết kết quả — chỉ sau khi commit (không gửi khi duyệt thất bại / bị thao tác khác thắng).
  const coachUserId = txRecord.wallet.coach.user?.id;
  if (coachUserId) {
    const notifType = action === "APPROVE" ? "WITHDRAWAL_APPROVED" : "WITHDRAWAL_REJECTED";
    const title = action === "APPROVE" ? "Yêu cầu rút tiền được duyệt" : "Yêu cầu rút tiền bị từ chối";
    const body =
      action === "APPROVE"
        ? `${amount.toLocaleString("vi-VN")}đ đã được chuyển vào tài khoản của bạn.`
        : `Yêu cầu rút ${amount.toLocaleString("vi-VN")}đ bị từ chối.${reason ? ` Lý do: ${reason}` : ""}`;
    createNotification(coachUserId, notifType, title, body).catch(() => {});
  }

  return result;
}

const WITHDRAWAL_INCLUDE = {
  class: { select: { id: true, name: true } },
  wallet: {
    include: { coach: { include: { user: { select: { id: true, fullName: true, email: true, phone: true } } } } },
  },
} satisfies Prisma.WalletTransactionInclude;

type WithdrawalRow = Prisma.WalletTransactionGetPayload<{ include: typeof WITHDRAWAL_INCLUDE }>;

/** Lệnh rút + thông tin HLV + số dư/tạm giữ hiện tại của ví (để Manager đối chiếu trước khi duyệt). */
async function toWithdrawalView(row: WithdrawalRow) {
  const eligibility = await computeWithdrawEligibility(prisma, row.wallet);
  const { wallet, ...tx } = row;
  return {
    ...tx,
    rejectReason: tx.status === "REJECTED" ? tx.note?.replace(/^Bị từ chối:?\s*/, "") ?? null : null,
    coach: {
      id: wallet.coach.id,
      userId: wallet.coach.user.id,
      fullName: wallet.coach.user.fullName,
      email: wallet.coach.user.email,
      phone: wallet.coach.user.phone,
    },
    wallet: {
      id: wallet.id,
      balance: wallet.balance,
      pendingRefundDebit: eligibility.pendingRefundDebit,
      available: eligibility.available,
    },
  };
}

/** BE-7: `GET /coaches/wallet/transactions?type=WITHDRAWAL&status=PENDING` (MANAGER). */
export async function listWalletTransactionsForManager(query: any) {
  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "10") || 10));
  const where: Prisma.WalletTransactionWhereInput = { type: query.type ?? "WITHDRAWAL" };
  if (query.status) where.status = query.status;
  if (query.coachId) where.wallet = { coachId: query.coachId };

  const [total, rows] = await Promise.all([
    prisma.walletTransaction.count({ where }),
    prisma.walletTransaction.findMany({
      where,
      include: WITHDRAWAL_INCLUDE,
      orderBy: { createdAt: query.status === "PENDING" ? "asc" : "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  const transactions = await Promise.all(rows.map(toWithdrawalView));
  return { transactions, pagination: buildPaginationMeta(total, page, limit) };
}

/** BE-7: `GET /coaches/wallet/transactions/:txId` (MANAGER). */
export async function getWalletTransactionForManager(txId: string) {
  const row = await prisma.walletTransaction.findUnique({ where: { id: txId }, include: WITHDRAWAL_INCLUDE });
  if (!row) throw new AppError("Wallet transaction not found", 404);
  return toWithdrawalView(row);
}
