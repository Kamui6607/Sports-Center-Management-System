-- Membership concurrent-class quota.
-- Mỗi MembershipPlan quy định số Class KHÁC NHAU (DISTINCT Class) tối đa mà hội viên được giữ
-- đồng thời: đếm Enrollment BOOKED ở ClassSchedule SCHEDULED chưa bắt đầu.
-- Migration này CHỈ thêm cột + backfill quota, KHÔNG đụng dữ liệu Enrollment / Attendance / ClassSchedule.

-- 1. Thêm cột với default tạm để backfill an toàn cho các row đang có.
ALTER TABLE "MembershipPlan" ADD COLUMN "maxConcurrentClasses" INTEGER NOT NULL DEFAULT 0;

-- 2. Backfill theo hạng gói nghiệp vụ hiện tại: FREE => 0, MEMBERSHIP => 3, PREMIUM => 6.
UPDATE "MembershipPlan"
SET "maxConcurrentClasses" = CASE "tier"
  WHEN 'FREE' THEN 0
  WHEN 'MEMBERSHIP' THEN 3
  WHEN 'PREMIUM' THEN 6
  ELSE 0
END;

-- 3. Bỏ default tạm: quota là cấu hình nghiệp vụ do Manager nhập qua API, DB không tự đoán.
ALTER TABLE "MembershipPlan" ALTER COLUMN "maxConcurrentClasses" DROP DEFAULT;
