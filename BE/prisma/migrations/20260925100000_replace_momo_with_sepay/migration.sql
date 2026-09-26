-- BỎ thanh toán ONLINE qua MoMo → CHUYỂN sang SePay (VietQR + webhook).
-- 1. PaymentMethod: bỏ 'MOMO', thêm 'SEPAY'. Giao dịch MOMO cũ (nếu có) được map sang SEPAY
--    để không vi phạm enum mới; dữ liệu đối soát vẫn giữ nguyên trong gatewayPayload.
-- 2. Payment.gateway 'MOMO' → 'SEPAY' cho các bản ghi online cũ.
-- 3. Thêm bảng SepayWebhookEvent: log webhook + `sepayId` UNIQUE chống xử lý trùng
--    khi SePay retry/replay (xem src/modules/payments/sepay-payments.service.ts).

-- AlterEnum: Postgres không xoá được giá trị enum ⇒ tạo type mới rồi cast cột.
ALTER TYPE "PaymentMethod" RENAME TO "PaymentMethod_old";

CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'SEPAY');

ALTER TABLE "Payment"
  ALTER COLUMN "method" TYPE "PaymentMethod"
  USING (CASE WHEN "method"::text = 'MOMO' THEN 'SEPAY' ELSE "method"::text END)::"PaymentMethod";

DROP TYPE "PaymentMethod_old";

UPDATE "Payment" SET "gateway" = 'SEPAY' WHERE "gateway" = 'MOMO';

-- CreateEnum
CREATE TYPE "SepayWebhookStatus" AS ENUM ('PENDING', 'PROCESSED', 'DUPLICATE', 'LATE', 'MISMATCH', 'IGNORED');

-- CreateTable
CREATE TABLE "SepayWebhookEvent" (
    "id" TEXT NOT NULL,
    "sepayId" INTEGER NOT NULL,
    "paymentId" TEXT,
    "status" "SepayWebhookStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SepayWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SepayWebhookEvent_sepayId_key" ON "SepayWebhookEvent"("sepayId");

-- CreateIndex
CREATE INDEX "SepayWebhookEvent_paymentId_idx" ON "SepayWebhookEvent"("paymentId");

-- CreateIndex
CREATE INDEX "SepayWebhookEvent_createdAt_idx" ON "SepayWebhookEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "SepayWebhookEvent"
  ADD CONSTRAINT "SepayWebhookEvent_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "Payment"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
