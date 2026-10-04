-- Hủy lớp & hoàn tiền: bảng Refund, buổi dạy bù (ClassSchedule.makeupForId), ví HLV ghi nhận khoản trừ do hoàn tiền.

-- ── (0) Ví HLV ───────────────────────────────────────────────────────────────────
-- CoachWallet/WalletTransaction có trong schema.prisma nhưng CHƯA từng có migration (DB có thể tạo bằng
-- `prisma db push`). Tạo kiểu IF NOT EXISTS: DB đã có thì bỏ qua, chưa có thì tạo đúng cấu trúc Prisma sinh ra.
DO $$ BEGIN
  CREATE TYPE "TransactionType" AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'REFUND_DEBIT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'REJECTED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
-- DB đã có enum cũ (chỉ DEPOSIT/WITHDRAWAL) ⇒ thêm giá trị mới.
ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'REFUND_DEBIT';

CREATE TABLE IF NOT EXISTS "CoachWallet" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CoachWallet_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CoachWallet_coachId_key" ON "CoachWallet"("coachId");

CREATE TABLE IF NOT EXISTS "WalletTransaction" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "type" "TransactionType" NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "classId" TEXT,
    "bankInfo" JSONB,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "WalletTransaction_walletId_idx" ON "WalletTransaction"("walletId");
CREATE INDEX IF NOT EXISTS "WalletTransaction_status_idx" ON "WalletTransaction"("status");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CoachWallet_coachId_fkey') THEN
    ALTER TABLE "CoachWallet" ADD CONSTRAINT "CoachWallet_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "CoachProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WalletTransaction_walletId_fkey') THEN
    ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "CoachWallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WalletTransaction_classId_fkey') THEN
    ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Liên kết giao dịch ví với giao dịch thanh toán gốc (để biết HLV đã được cộng bao nhiêu từ mỗi payment).
ALTER TABLE "WalletTransaction" ADD COLUMN IF NOT EXISTS "paymentId" TEXT;
CREATE INDEX IF NOT EXISTS "WalletTransaction_paymentId_idx" ON "WalletTransaction"("paymentId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WalletTransaction_paymentId_fkey') THEN
    ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ── (1) Buổi dạy bù ─────────────────────────────────────────────────────────────
ALTER TABLE "ClassSchedule" ADD COLUMN "makeupForId" TEXT;
CREATE UNIQUE INDEX "ClassSchedule_makeupForId_key" ON "ClassSchedule"("makeupForId");
ALTER TABLE "ClassSchedule" ADD CONSTRAINT "ClassSchedule_makeupForId_fkey" FOREIGN KEY ("makeupForId") REFERENCES "ClassSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── (2) Hoàn tiền ───────────────────────────────────────────────────────────────
CREATE TYPE "RefundReason" AS ENUM ('MEMBER_CANCEL_COURSE', 'SESSION_CANCELLED');
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'COMPLETED', 'REJECTED');

CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "classId" TEXT,
    "scheduleId" TEXT,
    "reason" "RefundReason" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "coachDebitAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "coachWalletId" TEXT,
    "note" TEXT,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT,
    "processedById" TEXT,
    "processedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Refund_status_idx" ON "Refund"("status");
CREATE INDEX "Refund_memberId_idx" ON "Refund"("memberId");
CREATE INDEX "Refund_coachWalletId_status_idx" ON "Refund"("coachWalletId", "status");
CREATE UNIQUE INDEX "Refund_paymentId_scheduleId_key" ON "Refund"("paymentId", "scheduleId");

ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "MemberProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ClassSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_coachWalletId_fkey" FOREIGN KEY ("coachWalletId") REFERENCES "CoachWallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
