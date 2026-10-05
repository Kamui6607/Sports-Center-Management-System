-- Nghiệp vụ: CHỈ Coach tạo lớp, mỗi lớp đúng 1 HLV phụ trách.
--   + Class.coachId (FK → CoachProfile, bắt buộc) thay cho bảng ClassMember và Class.createdById.
--   + Bỏ Enrollment.classId (lớp của buổi đã có ở ClassSchedule.classId).
-- Idempotent để chạy an toàn cả trên DB từng tạo bằng `db push`.

-- (1) Class.coachId: lấy từ ClassMember (ưu tiên HLV chính), không có thì từ người tạo lớp (nếu là Coach)
ALTER TABLE "Class" ADD COLUMN IF NOT EXISTS "coachId" TEXT;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name = 'ClassMember'
  ) THEN
    UPDATE "Class" c SET "coachId" = cm."coachId"
    FROM "ClassMember" cm
    WHERE cm."classId" = c."id" AND cm."isPrimary" = true AND c."coachId" IS NULL;

    UPDATE "Class" c SET "coachId" = (
      SELECT cm."coachId" FROM "ClassMember" cm
      WHERE cm."classId" = c."id"
      ORDER BY cm."createdAt" ASC
      LIMIT 1
    )
    WHERE c."coachId" IS NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'Class' AND column_name = 'createdById'
  ) THEN
    UPDATE "Class" c SET "coachId" = cp."id"
    FROM "CoachProfile" cp
    WHERE cp."userId" = c."createdById" AND c."coachId" IS NULL;
  END IF;
END $$;

-- Lớp không xác định được HLV ⇒ DỪNG, báo rõ để xử lý dữ liệu trước (không tự đoán).
DO $$
DECLARE missing INT;
BEGIN
  SELECT count(*) INTO missing FROM "Class" WHERE "coachId" IS NULL;
  IF missing > 0 THEN
    RAISE EXCEPTION 'Có % lớp chưa xác định được HLV (không có ClassMember, người tạo không phải Coach). Gán HLV cho các lớp này rồi chạy lại migration.', missing;
  END IF;
END $$;

ALTER TABLE "Class" ALTER COLUMN "coachId" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "Class_coachId_idx" ON "Class"("coachId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Class_coachId_fkey') THEN
    ALTER TABLE "Class" ADD CONSTRAINT "Class_coachId_fkey"
      FOREIGN KEY ("coachId") REFERENCES "CoachProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- (2) Bỏ Class.createdById (người tạo lớp chính là HLV của lớp)
ALTER TABLE "Class" DROP CONSTRAINT IF EXISTS "Class_createdById_fkey";
ALTER TABLE "Class" DROP COLUMN IF EXISTS "createdById";

-- (3) Bỏ bảng ClassMember
DROP TABLE IF EXISTS "ClassMember";

-- (4) Bỏ Enrollment.classId
ALTER TABLE "Enrollment" DROP CONSTRAINT IF EXISTS "Enrollment_classId_fkey";
DROP INDEX IF EXISTS "Enrollment_classId_idx";
ALTER TABLE "Enrollment" DROP COLUMN IF EXISTS "classId";
