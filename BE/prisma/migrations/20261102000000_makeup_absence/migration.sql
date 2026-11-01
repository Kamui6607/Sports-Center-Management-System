-- Báo vắng · Học bù · Buổi bù mở (Doc/MAKEUP_ABSENCE_PLAN.md). Idempotent, chỉ THÊM — không DROP/DELETE, không sửa dữ liệu cũ.

-- Thông báo mới (ADD VALUE IF NOT EXISTS: chạy lại an toàn).
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MEMBER_ABSENCE';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MAKEUP_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MAKEUP_SCHEDULED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MAKEUP_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MAKEUP_SLOT_OPENED';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MakeupRequestStatus') THEN
    CREATE TYPE "MakeupRequestStatus" AS ENUM ('PENDING', 'SCHEDULED', 'REJECTED', 'EXPIRED', 'CANCELLED');
  END IF;
END $$;

-- Buổi bù mở: không phải buổi chính.
ALTER TABLE "ClassSchedule" ADD COLUMN IF NOT EXISTS "isMakeupSlot" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ClassSchedule" ADD COLUMN IF NOT EXISTS "slotCapacity" INTEGER;

-- Chỗ học bù trỏ về yêu cầu.
ALTER TABLE "Enrollment" ADD COLUMN IF NOT EXISTS "makeupRequestId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Enrollment_makeupRequestId_key" ON "Enrollment"("makeupRequestId");

CREATE TABLE IF NOT EXISTS "MakeupRequest" (
  "id" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "missedEnrollmentId" TEXT NOT NULL,
  "missedScheduleId" TEXT NOT NULL,
  "paidClassId" TEXT NOT NULL,
  "coachId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "MakeupRequestStatus" NOT NULL DEFAULT 'PENDING',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "refundEligible" BOOLEAN NOT NULL DEFAULT false,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "resolvedAt" TIMESTAMP(3),
  "resolvedById" TEXT,
  "targetScheduleId" TEXT,
  "rejectReason" TEXT,
  "refundId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MakeupRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MakeupRequest_coachId_status_idx" ON "MakeupRequest"("coachId", "status");
CREATE INDEX IF NOT EXISTS "MakeupRequest_memberId_status_idx" ON "MakeupRequest"("memberId", "status");
CREATE INDEX IF NOT EXISTS "MakeupRequest_paidClassId_status_idx" ON "MakeupRequest"("paidClassId", "status");
CREATE INDEX IF NOT EXISTS "MakeupRequest_missedEnrollmentId_idx" ON "MakeupRequest"("missedEnrollmentId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MakeupRequest_memberId_fkey') THEN
    ALTER TABLE "MakeupRequest" ADD CONSTRAINT "MakeupRequest_memberId_fkey"
      FOREIGN KEY ("memberId") REFERENCES "MemberProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MakeupRequest_missedEnrollmentId_fkey') THEN
    ALTER TABLE "MakeupRequest" ADD CONSTRAINT "MakeupRequest_missedEnrollmentId_fkey"
      FOREIGN KEY ("missedEnrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MakeupRequest_targetScheduleId_fkey') THEN
    ALTER TABLE "MakeupRequest" ADD CONSTRAINT "MakeupRequest_targetScheduleId_fkey"
      FOREIGN KEY ("targetScheduleId") REFERENCES "ClassSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
