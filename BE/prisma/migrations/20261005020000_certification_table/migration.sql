-- Tách hồ sơ chứng nhận HLV (CV) khỏi "CoachProfile" ra bảng "Certification" (1–1).
-- Chuyển dữ liệu "cvUrl"/"approvalStatus" sang bảng mới rồi bỏ 2 cột cũ. Idempotent.

-- (1) Bảng Certification (kế thừa BaseEntity)
CREATE TABLE IF NOT EXISTS "Certification" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "fileUrl" TEXT,
    "status" "CoachApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Certification_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Certification_coachId_key" ON "Certification"("coachId");
CREATE INDEX IF NOT EXISTS "Certification_status_idx" ON "Certification"("status");
CREATE INDEX IF NOT EXISTS "Certification_reviewedById_idx" ON "Certification"("reviewedById");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Certification_coachId_fkey') THEN
    ALTER TABLE "Certification" ADD CONSTRAINT "Certification_coachId_fkey"
      FOREIGN KEY ("coachId") REFERENCES "CoachProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Certification_reviewedById_fkey') THEN
    ALTER TABLE "Certification" ADD CONSTRAINT "Certification_reviewedById_fkey"
      FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- (2) Chép hồ sơ hiện có: coach đã nộp CV hoặc đã được duyệt/từ chối.
--     Coach chưa nộp CV (cvUrl NULL, PENDING) ⇒ chưa có Certification.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'CoachProfile' AND column_name = 'cvUrl'
  ) THEN
    INSERT INTO "Certification" ("id", "coachId", "fileUrl", "status", "submittedAt", "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text, cp."id", cp."cvUrl", cp."approvalStatus", cp."updatedAt", cp."createdAt", cp."updatedAt"
    FROM "CoachProfile" cp
    WHERE cp."cvUrl" IS NOT NULL OR cp."approvalStatus" <> 'PENDING'
    ON CONFLICT ("coachId") DO NOTHING;
  END IF;
END $$;

-- (3) Bỏ 2 cột cũ trên CoachProfile
ALTER TABLE "CoachProfile" DROP COLUMN IF EXISTS "cvUrl";
ALTER TABLE "CoachProfile" DROP COLUMN IF EXISTS "approvalStatus";
