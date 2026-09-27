-- A07: snapshot offer tại THỜI ĐIỂM TẠO ĐƠN (chốt tiền theo đúng điều khoản đã bán)
-- A06: trạng thái CẤP QUYỀN tách khỏi trạng thái TIỀN (REQUIRES_REVIEW khi tiền đã về nhưng chưa cấp gói)
-- Additive & idempotent-safe: mọi cột đều nullable, không đụng dữ liệu cũ.

-- CreateEnum
CREATE TYPE "PaymentActivationStatus" AS ENUM ('ACTIVATED', 'REQUIRES_REVIEW');

-- AlterTable: Payment (snapshot + trạng thái cấp quyền)
ALTER TABLE "Payment"
  ADD COLUMN "planNameSnapshot" TEXT,
  ADD COLUMN "planTierSnapshot" "MemberTier",
  ADD COLUMN "durationDaysSnapshot" INTEGER,
  ADD COLUMN "maxConcurrentClassesSnapshot" INTEGER,
  ADD COLUMN "activationStatus" "PaymentActivationStatus",
  ADD COLUMN "reviewReason" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedById" TEXT;

-- CreateIndex
CREATE INDEX "Payment_activationStatus_idx" ON "Payment"("activationStatus");

-- AlterTable: MembershipSubscription (snapshot quota đã bán cho kỳ này)
ALTER TABLE "MembershipSubscription" ADD COLUMN "maxConcurrentClassesSnapshot" INTEGER;
