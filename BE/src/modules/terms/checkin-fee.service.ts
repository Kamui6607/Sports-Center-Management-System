import type { CoachWallet, Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { lockCoachWallet } from "../../utils/dbLocks.js";
import { computeWithdrawEligibility } from "../coaches/wallet-eligibility.service.js";

type Tx = Prisma.TransactionClient;

export interface ChargeResult {
  /** Số tiền thực trừ được từ tiền ròng của các khóa. */
  charged: number;
  /** Phần chưa trừ được (ví chưa đủ tiền ròng khả dụng) — người gọi ghi thành nợ. */
  shortfall: number;
  /** Chi tiết từng khoản trừ theo khóa (từ cũ đến mới). */
  parts: { classId: string; className: string; amount: number }[];
}

/**
 * Trừ [amount] từ tiền ròng của các khóa CŨ NHẤT còn dư trước (FIFO theo ngày tạo khóa).
 *
 * Vì sao theo khóa: rút tiền của HLV tính theo từng khóa (`computeWithdrawEligibility`: tiền ròng = DEPOSIT − REFUND_DEBIT − CHECKIN_FEE),
 * nên phí phải gắn vào một khóa cụ thể thì số liệu rút tiền mới khớp. Mỗi khoản trừ là một `WalletTransaction` loại `CHECKIN_FEE`.
 *
 * Không trừ vượt: phần tiền đang tạm giữ cho hoàn tiền chờ duyệt, lệnh rút đang chờ, và tiền ròng của từng khóa đều được tôn trọng;
 * không đủ ⇒ trả `shortfall` (không để số dư âm vì phí check-in).
 * Phải gọi TRONG transaction đã `lockCoachWallet`.
 */
export async function chargeOldestEarnings(
  tx: Tx,
  wallet: Pick<CoachWallet, "id" | "coachId" | "balance" | "feeDebt">,
  amount: number,
  note: string
): Promise<ChargeResult> {
  const result: ChargeResult = { charged: 0, shortfall: Math.max(0, Math.round(amount)), parts: [] };
  if (result.shortfall <= 0) return result;

  // Không tính nợ cũ vào `available` ở đây — ta chỉ cần số liệu từng khóa + khoản đang bị giữ.
  const eligibility = await computeWithdrawEligibility(tx, { ...wallet, feeDebt: 0 });
  let capacity = Math.max(0, eligibility.balance - eligibility.pendingRefundDebit - eligibility.pendingWithdrawal);

  for (const cls of eligibility.classes) {
    if (result.shortfall <= 0 || capacity <= 0) break;
    const free = Math.max(0, cls.netEarned - cls.pendingRefundDebit);
    const take = Math.floor(Math.min(result.shortfall, free, capacity));
    if (take <= 0) continue;
    await tx.walletTransaction.create({
      data: { walletId: wallet.id, amount: take, type: "CHECKIN_FEE", status: "COMPLETED", classId: cls.classId, note },
    });
    result.parts.push({ classId: cls.classId, className: cls.className, amount: take });
    result.charged += take;
    result.shortfall -= take;
    capacity -= take;
  }
  if (result.charged > 0) {
    await tx.coachWallet.update({ where: { id: wallet.id }, data: { balance: { decrement: result.charged } } });
  }
  return result;
}

/** Trừ nợ phí check-in bằng tiền ròng khả dụng. Gọi trong transaction đã khóa ví; trả ví sau cập nhật. */
export async function settleCheckinDebtTx(tx: Tx, walletId: string): Promise<CoachWallet> {
  const wallet = await tx.coachWallet.findUniqueOrThrow({ where: { id: walletId } });
  const debt = Number(wallet.feeDebt);
  if (debt <= 0) return wallet;
  const res = await chargeOldestEarnings(tx, wallet, debt, "Trừ nợ phí check-in phòng gym");
  if (res.charged <= 0) return wallet;
  return tx.coachWallet.update({ where: { id: walletId }, data: { feeDebt: res.shortfall } });
}

/** Trừ nợ phí check-in của một ví (tự mở transaction + khóa ví). Trả ví mới nhất. */
export async function settleCheckinDebt(walletId: string): Promise<CoachWallet> {
  return prisma.$transaction(async (tx) => {
    await lockCoachWallet(tx, walletId);
    return settleCheckinDebtTx(tx, walletId);
  });
}
