-- Class.goal: mục tiêu của lớp để Member xem trước khi enroll. Idempotent.
ALTER TABLE "Class" ADD COLUMN IF NOT EXISTS "goal" TEXT;
