-- CreateEnum
CREATE TYPE "AttendancePenaltyStatus" AS ENUM ('PENDING', 'APPLIED', 'REVOKED', 'EXPIRED');

-- AlterEnum (chỉ thêm value mới, không dùng trong cùng transaction)
ALTER TYPE "NotificationType" ADD VALUE 'ATTENDANCE_WARNING';
ALTER TYPE "NotificationType" ADD VALUE 'ATTENDANCE_PENALTY';
ALTER TYPE "NotificationType" ADD VALUE 'ATTENDANCE_PENALTY_REVOKED';

-- CreateTable
CREATE TABLE "AttendancePenalty" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "attendanceRate" DOUBLE PRECISION NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "releasedCount" INTEGER NOT NULL DEFAULT 0,
    "releasedEnrollmentIds" JSONB,
    "blockedUntil" TIMESTAMP(3),
    "status" "AttendancePenaltyStatus" NOT NULL DEFAULT 'PENDING',
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "appealReason" TEXT,
    "appealedAt" TIMESTAMP(3),
    "revokedBy" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendancePenalty_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttendancePenalty_memberId_classId_idx" ON "AttendancePenalty"("memberId", "classId");

-- CreateIndex
CREATE INDEX "AttendancePenalty_status_blockedUntil_idx" ON "AttendancePenalty"("status", "blockedUntil");

-- AddForeignKey
ALTER TABLE "AttendancePenalty" ADD CONSTRAINT "AttendancePenalty_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "MemberProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendancePenalty" ADD CONSTRAINT "AttendancePenalty_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendancePenalty" ADD CONSTRAINT "AttendancePenalty_decidedBy_fkey" FOREIGN KEY ("decidedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
