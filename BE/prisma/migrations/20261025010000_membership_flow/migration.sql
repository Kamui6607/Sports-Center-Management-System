-- Luồng gói thành viên (Doc/MEMBERSHIP_FLOW.md): cấu hình gói đầy đủ, nhắc gia hạn, Manager hủy gói, nhật ký quét thẻ.
-- Viết idempotent (IF NOT EXISTS / DO ... EXCEPTION) vì DB Render dùng chung cả nhóm. Chỉ THÊM.

ALTER TYPE "RefundReason" ADD VALUE IF NOT EXISTS 'MEMBERSHIP_CANCELLED';

ALTER TABLE "MembershipPlan" ADD COLUMN IF NOT EXISTS "benefits" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN IF NOT EXISTS "isFeatured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Membership" ADD COLUMN IF NOT EXISTS "reminderStage" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "cancelReason" TEXT,
ADD COLUMN IF NOT EXISTS "cancelledById" TEXT;

CREATE TABLE IF NOT EXISTS "MemberPassScan" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "membershipId" TEXT,
    "scannedBy" TEXT NOT NULL,
    "valid" BOOLEAN NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MemberPassScan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MemberPassScan_memberId_createdAt_idx" ON "MemberPassScan"("memberId", "createdAt");
CREATE INDEX IF NOT EXISTS "MemberPassScan_createdAt_idx" ON "MemberPassScan"("createdAt");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MemberPassScan_memberId_fkey') THEN
    ALTER TABLE "MemberPassScan" ADD CONSTRAINT "MemberPassScan_memberId_fkey"
      FOREIGN KEY ("memberId") REFERENCES "MemberProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MemberPassScan_membershipId_fkey') THEN
    ALTER TABLE "MemberPassScan" ADD CONSTRAINT "MemberPassScan_membershipId_fkey"
      FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Gói đã hết hạn trước đợt này: coi như đã nhắc xong (không gửi thông báo "hết hạn" cho dữ liệu cũ).
UPDATE "Membership" SET "reminderStage" = 3 WHERE "status" <> 'ACTIVE' AND "reminderStage" = 0;
