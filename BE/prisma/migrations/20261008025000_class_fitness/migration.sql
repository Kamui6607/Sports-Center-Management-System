-- Class.fitness: môn tập của lớp (thay cho bảng bộ môn + quan hệ nhiều-nhiều). Idempotent.
-- PHẢI chạy TRƯỚC 20261008030000_drop_sport để còn dữ liệu bảng "Fitness" mà backfill.
ALTER TABLE "Class" ADD COLUMN IF NOT EXISTS "fitness" TEXT;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = '_ClassToFitness'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'Fitness'
  ) THEN
    -- Lớp từng gắn nhiều môn: lấy môn đầu tiên theo tên.
    UPDATE "Class" c SET "fitness" = (
      SELECT f."name" FROM "_ClassToFitness" j
      JOIN "Fitness" f ON f."id" = j."B"
      WHERE j."A" = c."id"
      ORDER BY f."name" ASC
      LIMIT 1
    )
    WHERE c."fitness" IS NULL;
  END IF;
END $$;

-- Lớp không có môn nào (hoặc bảng đã bị xóa từ trước): để "Khác" để Coach/Manager cập nhật lại.
UPDATE "Class" SET "fitness" = 'Khác' WHERE "fitness" IS NULL;
ALTER TABLE "Class" ALTER COLUMN "fitness" SET NOT NULL;
