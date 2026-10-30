-- Lộ trình tập gắn với khóa học (xem lộ trình riêng từng khóa). Idempotent, chỉ THÊM.
ALTER TABLE "TrainingPlan" ADD COLUMN IF NOT EXISTS "classId" TEXT;
CREATE INDEX IF NOT EXISTS "TrainingPlan_classId_idx" ON "TrainingPlan"("classId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TrainingPlan_classId_fkey') THEN
    ALTER TABLE "TrainingPlan" ADD CONSTRAINT "TrainingPlan_classId_fkey"
      FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Backfill: HLV chỉ dạy hội viên đúng MỘT khóa ⇒ lộ trình cũ thuộc khóa đó. Nhiều khóa ⇒ để trống (lộ trình chung).
UPDATE "TrainingPlan" tp SET "classId" = x."classId"
FROM (
  SELECT e."memberId", c."coachId", MIN(c."id") AS "classId"
  FROM "Enrollment" e
  JOIN "ClassSchedule" cs ON cs."id" = e."scheduleId"
  JOIN "Class" c ON c."id" = cs."classId"
  WHERE e."status" IN ('BOOKED', 'COMPLETED')
  GROUP BY e."memberId", c."coachId"
  HAVING COUNT(DISTINCT c."id") = 1
) x
WHERE tp."classId" IS NULL AND tp."memberId" = x."memberId" AND tp."coachId" = x."coachId";
