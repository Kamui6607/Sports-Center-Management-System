-- Kỳ học & quyền lợi của Coach (xem Doc/COACH_TERMS.md).
-- Viết idempotent (IF NOT EXISTS / DO ... EXCEPTION) vì DB Render dùng chung cả nhóm và một số DB đã `db push`.
-- Chỉ THÊM enum + bảng + index + khóa ngoại: không DROP, không DELETE, không sửa bảng hiện có.

-- Enum
DO $$ BEGIN
  CREATE TYPE "CoachTermState" AS ENUM ('PENDING', 'COMPLIANT', 'NON_COMPLIANT', 'EXEMPT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CoachLeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Kỳ học (3 kỳ/năm; dòng được BE tạo tự động khi cần)
CREATE TABLE IF NOT EXISTS "AcademicTerm" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "graceDays" INTEGER NOT NULL DEFAULT 14,
    "managerReportStage" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademicTerm_pkey" PRIMARY KEY ("id")
);

-- Kết quả đánh giá Coach × kỳ
CREATE TABLE IF NOT EXISTS "CoachTermStatus" (
    "id" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "state" "CoachTermState" NOT NULL DEFAULT 'PENDING',
    "manualExempt" BOOLEAN NOT NULL DEFAULT false,
    "exemptReason" TEXT,
    "exemptBy" TEXT,
    "exemptAt" TIMESTAMP(3),
    "metrics" JSONB,
    "evaluatedAt" TIMESTAMP(3),
    "lastReminderStage" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachTermStatus_pkey" PRIMARY KEY ("id")
);

-- Đơn xin nghỉ phép/ốm của Coach
CREATE TABLE IF NOT EXISTS "CoachLeave" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'PERSONAL',
    "reason" TEXT NOT NULL,
    "status" "CoachLeaveStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachLeave_pkey" PRIMARY KEY ("id")
);

-- Nhật ký quét thẻ Coach ở cửa
CREATE TABLE IF NOT EXISTS "CoachPassScan" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "scannedBy" TEXT NOT NULL,
    "valid" BOOLEAN NOT NULL,
    "state" "CoachTermState",
    "termId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachPassScan_pkey" PRIMARY KEY ("id")
);

-- Index
CREATE INDEX IF NOT EXISTS "AcademicTerm_startDate_endDate_idx" ON "AcademicTerm"("startDate", "endDate");
CREATE UNIQUE INDEX IF NOT EXISTS "AcademicTerm_year_seq_key" ON "AcademicTerm"("year", "seq");
CREATE INDEX IF NOT EXISTS "CoachTermStatus_termId_state_idx" ON "CoachTermStatus"("termId", "state");
CREATE INDEX IF NOT EXISTS "CoachTermStatus_coachId_idx" ON "CoachTermStatus"("coachId");
CREATE UNIQUE INDEX IF NOT EXISTS "CoachTermStatus_termId_coachId_key" ON "CoachTermStatus"("termId", "coachId");
CREATE INDEX IF NOT EXISTS "CoachLeave_coachId_status_idx" ON "CoachLeave"("coachId", "status");
CREATE INDEX IF NOT EXISTS "CoachLeave_status_createdAt_idx" ON "CoachLeave"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "CoachPassScan_coachId_createdAt_idx" ON "CoachPassScan"("coachId", "createdAt");
CREATE INDEX IF NOT EXISTS "CoachPassScan_createdAt_idx" ON "CoachPassScan"("createdAt");

-- Khóa ngoại
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CoachTermStatus_termId_fkey') THEN
    ALTER TABLE "CoachTermStatus" ADD CONSTRAINT "CoachTermStatus_termId_fkey"
      FOREIGN KEY ("termId") REFERENCES "AcademicTerm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CoachTermStatus_coachId_fkey') THEN
    ALTER TABLE "CoachTermStatus" ADD CONSTRAINT "CoachTermStatus_coachId_fkey"
      FOREIGN KEY ("coachId") REFERENCES "CoachProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CoachLeave_coachId_fkey') THEN
    ALTER TABLE "CoachLeave" ADD CONSTRAINT "CoachLeave_coachId_fkey"
      FOREIGN KEY ("coachId") REFERENCES "CoachProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CoachPassScan_coachId_fkey') THEN
    ALTER TABLE "CoachPassScan" ADD CONSTRAINT "CoachPassScan_coachId_fkey"
      FOREIGN KEY ("coachId") REFERENCES "CoachProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
