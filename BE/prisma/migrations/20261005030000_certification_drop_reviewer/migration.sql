-- Certification chỉ nối với CoachProfile: bỏ người duyệt (reviewedById → User) và thời điểm duyệt.
ALTER TABLE "Certification" DROP CONSTRAINT IF EXISTS "Certification_reviewedById_fkey";
DROP INDEX IF EXISTS "Certification_reviewedById_idx";
ALTER TABLE "Certification" DROP COLUMN IF EXISTS "reviewedById";
ALTER TABLE "Certification" DROP COLUMN IF EXISTS "reviewedAt";
