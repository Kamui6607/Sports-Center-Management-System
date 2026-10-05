import { prisma } from "../../config/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { createNotification } from "../notifications/notifications.service.js";

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

  if (!coachProfile.wallet) {
    const wallet = await prisma.coachWallet.create({
      data: { coachId: coachProfile.id, balance: 0 },
    });
    return { wallet, coach: { fullName: coachProfile.user.fullName, email: coachProfile.user.email } };
  }

  return {
    wallet: coachProfile.wallet,
    coach: { fullName: coachProfile.user.fullName, email: coachProfile.user.email },
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
  if (!coachProfile || !coachProfile.wallet) throw new AppError("Coach wallet not found", 404);

  const page = Math.max(1, parseInt(query.page ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "10") || 10));
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

  const wallet = coachProfile.wallet;

  if (data.amount <= 0) throw new AppError("Amount must be positive", 400);
  if (Number(wallet.balance) < data.amount) {
    throw new AppError(
      `Số dư không đủ. Ví hiện có ${Number(wallet.balance).toLocaleString("vi-VN")}đ, bạn yêu cầu rút ${data.amount.toLocaleString("vi-VN")}đ.`,
      400,
      { code: "INSUFFICIENT_BALANCE", balance: Number(wallet.balance), requested: data.amount }
    );
  }

  // Tiền đang bị giữ cho các yêu cầu hoàn tiền chờ duyệt (sẽ bị trừ khỏi ví khi Manager duyệt).
  const held = await prisma.refund.aggregate({
    where: { coachWalletId: wallet.id, status: "PENDING" },
    _sum: { coachDebitAmount: true },
  });
  const pendingRefundDebit = Number(held._sum.coachDebitAmount ?? 0);
  const available = Number(wallet.balance) - pendingRefundDebit;
  if (data.amount > available) {
    throw new AppError(
      `Số dư khả dụng chỉ còn ${Math.max(0, available).toLocaleString("vi-VN")}đ ` +
        `(đang giữ ${pendingRefundDebit.toLocaleString("vi-VN")}đ cho các yêu cầu hoàn tiền chờ duyệt).`,
      400,
      { code: "BALANCE_HELD_FOR_REFUND", balance: Number(wallet.balance), pendingRefundDebit, available }
    );
  }

  // Kiểm tra: tất cả class mà coach nhận thu nhập đã COMPLETED chưa?
  const pendingClasses = await prisma.class.count({
    where: {
      coachId: coachProfile.id,
      status: { in: ["PENDING", "APPROVED"] },
    },
  });

  if (pendingClasses > 0) {
    throw new AppError(
      `Bạn còn ${pendingClasses} khóa học chưa hoàn thành. Vui lòng chờ tất cả khóa học kết thúc (status COMPLETED) mới được rút tiền.`,
      400,
      { code: "CLASS_NOT_COMPLETED", pendingClasses }
    );
  }

  // Không có yêu cầu PENDING chưa xử lý
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
  reason?: string
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

  return prisma.$transaction(async (db) => {
    if (action === "APPROVE") {
      const wallet = await db.coachWallet.findUnique({ where: { id: txRecord.walletId } });
      if (!wallet) throw new AppError("Wallet not found", 404);
      if (Number(wallet.balance) < Number(txRecord.amount)) {
        throw new AppError("Số dư ví không đủ để duyệt yêu cầu này", 400);
      }
      await db.coachWallet.update({
        where: { id: txRecord.walletId },
        data: { balance: { decrement: Number(txRecord.amount) } },
      });
      await db.walletTransaction.update({
        where: { id: transactionId },
        data: { status: "COMPLETED", note: reason ? `Đã duyệt. ${reason}` : "Đã duyệt và chuyển tiền" },
      });
    } else {
      await db.walletTransaction.update({
        where: { id: transactionId },
        data: {
          status: "REJECTED",
          note: reason ? `Bị từ chối: ${reason}` : "Bị từ chối",
        },
      });
    }

    // Thông báo coach biết kết quả
    const coachUserId = txRecord.wallet.coach.user?.id;
    if (coachUserId) {
      const notifType = action === "APPROVE" ? "WITHDRAWAL_APPROVED" : "WITHDRAWAL_REJECTED";
      const title = action === "APPROVE" ? "Yêu cầu rút tiền được duyệt" : "Yêu cầu rút tiền bị từ chối";
      const body =
        action === "APPROVE"
          ? `${Number(txRecord.amount).toLocaleString("vi-VN")}đ đã được chuyển vào tài khoản của bạn.`
          : `Yêu cầu rút ${Number(txRecord.amount).toLocaleString("vi-VN")}đ bị từ chối.${reason ? ` Lý do: ${reason}` : ""}`;
      createNotification(coachUserId, notifType, title, body).catch(() => {});
    }

    return db.walletTransaction.findUnique({ where: { id: transactionId } });
  });
}
