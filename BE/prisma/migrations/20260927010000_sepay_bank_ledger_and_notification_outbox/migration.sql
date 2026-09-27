-- A14: ledger giao dịch ngân hàng — 1 movement chỉ phân bổ 1 lần, dùng chung webhook + đối soát.
-- F01: transactional outbox cho notification — ghi trong transaction, gửi sau commit, retry khi lỗi.

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED');

-- CreateTable: SepayBankTransaction
CREATE TABLE "SepayBankTransaction" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "sepayId" INTEGER,
    "apiTransactionId" TEXT,
    "referenceCode" TEXT,
    "gateway" TEXT,
    "accountNumber" TEXT,
    "transferType" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "content" TEXT,
    "code" TEXT,
    "payload" JSONB,
    "paymentId" TEXT,
    "allocatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SepayBankTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable: NotificationOutbox
CREATE TABLE "NotificationOutbox" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (unique identity + allocation one-shot)
CREATE UNIQUE INDEX "SepayBankTransaction_externalId_key" ON "SepayBankTransaction"("externalId");
CREATE UNIQUE INDEX "SepayBankTransaction_sepayId_key" ON "SepayBankTransaction"("sepayId");
CREATE UNIQUE INDEX "SepayBankTransaction_apiTransactionId_key" ON "SepayBankTransaction"("apiTransactionId");
CREATE UNIQUE INDEX "SepayBankTransaction_paymentId_key" ON "SepayBankTransaction"("paymentId");
CREATE INDEX "SepayBankTransaction_createdAt_idx" ON "SepayBankTransaction"("createdAt");
CREATE INDEX "SepayBankTransaction_referenceCode_idx" ON "SepayBankTransaction"("referenceCode");
CREATE INDEX "NotificationOutbox_status_availableAt_idx" ON "NotificationOutbox"("status", "availableAt");
CREATE INDEX "NotificationOutbox_userId_idx" ON "NotificationOutbox"("userId");

-- AddForeignKey
ALTER TABLE "SepayBankTransaction" ADD CONSTRAINT "SepayBankTransaction_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
