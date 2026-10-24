-- Thanh toán ONLINE qua MoMo cho hội viên tự mua gói (POST /payments/momo/checkout → IPN).
-- 1. PaymentMethod thêm MOMO (giao dịch tại quầy vẫn là CASH/BANK_TRANSFER).
-- 2. Payment thêm planId (gói muốn mua) + gateway (MOMO) + gatewayTransId (MoMo transId)
--    + gatewayPayload (raw request/response/IPN để audit) + index tra cứu theo cổng.
-- Giao dịch online được tạo ở trạng thái PENDING (subscriptionId = NULL); CHỈ khi cổng xác nhận
-- SUCCESS mới tạo MembershipSubscription + Invoice (xem subscription-purchase.service.ts).

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'MOMO';

-- AlterTable
ALTER TABLE "Payment"
  ADD COLUMN "planId" TEXT,
  ADD COLUMN "gateway" TEXT,
  ADD COLUMN "gatewayTransId" TEXT,
  ADD COLUMN "gatewayPayload" JSONB;

-- CreateIndex
CREATE INDEX "Payment_gateway_status_idx" ON "Payment"("gateway", "status");

-- AddForeignKey
ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "MembershipPlan"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
