import { apiClient, ApiError } from "./client";
import type { SepayCheckout, SepayMockConfirmResult } from "../types/member";

type PendingCheckoutDetails = Partial<SepayCheckout> & {
  code?: string;
  paymentId?: string;
};

export const sepayApi = {
  createCheckout: (planId: string) =>
    apiClient.post<SepayCheckout>("/payments/sepay/checkout", { planId }),

  getCheckout: (paymentId: string) =>
    apiClient.get<SepayCheckout>(
      `/payments/sepay/${encodeURIComponent(paymentId)}`,
    ),

  mockConfirm: (paymentId: string) =>
    apiClient.post<SepayMockConfirmResult>("/payments/sepay/mock-confirm", {
      paymentId,
    }),

  pendingCheckoutFromError(error: unknown): SepayCheckout | null {
    if (!(error instanceof ApiError) || error.status !== 409) return null;
    const details = error.details as PendingCheckoutDetails | undefined;
    if (
      details?.code !== "SEPAY_PAYMENT_PENDING" ||
      !details.paymentId ||
      !details.orderCode ||
      typeof details.amount !== "number" ||
      !details.expiresAt ||
      !details.qrUrl ||
      !details.transferContent
    )
      return null;

    return {
      paymentId: details.paymentId,
      orderCode: details.orderCode,
      amount: details.amount,
      currency: details.currency ?? "VND",
      status: "PENDING",
      gateway: details.gateway ?? "SEPAY",
      expiresAt: details.expiresAt,
      qrUrl: details.qrUrl,
      transferContent: details.transferContent,
      bank: details.bank,
      plan: details.plan,
      paidAt: details.paidAt,
      subscriptionId: details.subscriptionId,
    };
  },
};
