import { Request, Response, NextFunction } from "express";
import * as walletService from "./coach-wallet.service.js";
import { sendSuccess, sendCreated } from "../../utils/response.js";

export async function getMyWallet(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await walletService.getMyWallet(req.user!.id);
    sendSuccess(res, result, "Wallet retrieved successfully");
  } catch (err) { next(err); }
}

export async function getMyWalletTransactions(req: Request, res: Response, next: NextFunction) {
  try {
    const { transactions, pagination } = await walletService.getMyWalletTransactions(req.user!.id, req.query);
    sendSuccess(res, transactions, "Wallet transactions retrieved successfully", 200, pagination);
  } catch (err) { next(err); }
}

export async function requestWithdrawal(req: Request, res: Response, next: NextFunction) {
  try {
    const { amount, bankInfo, note } = req.body;
    const transaction = await walletService.requestWithdrawal(req.user!.id, { amount, bankInfo, note });
    sendCreated(res, transaction, "Withdrawal request submitted successfully");
  } catch (err) { next(err); }
}

export async function reviewWithdrawal(req: Request, res: Response, next: NextFunction) {
  try {
    const { action, reason } = req.body;
    const result = await walletService.reviewWithdrawal(req.params.txId as string, action, reason);
    const msg = action === "APPROVE" ? "Withdrawal approved" : "Withdrawal rejected";
    sendSuccess(res, result, msg);
  } catch (err) { next(err); }
}

/** BE-7: Manager liệt kê lệnh rút tiền (mặc định type=WITHDRAWAL). */
export async function listWalletTransactions(req: Request, res: Response, next: NextFunction) {
  try {
    const { transactions, pagination } = await walletService.listWalletTransactionsForManager(req.query);
    sendSuccess(res, transactions, "Wallet transactions retrieved successfully", 200, pagination);
  } catch (err) { next(err); }
}

/** BE-7: Manager xem chi tiết một lệnh rút tiền. */
export async function getWalletTransaction(req: Request, res: Response, next: NextFunction) {
  try {
    const tx = await walletService.getWalletTransactionForManager(req.params.txId as string);
    sendSuccess(res, tx, "Wallet transaction retrieved successfully");
  } catch (err) { next(err); }
}
