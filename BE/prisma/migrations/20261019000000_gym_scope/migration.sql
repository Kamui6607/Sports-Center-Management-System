-- Đợt 19/10/2026 — thu hẹp phạm vi Gym (xem Doc/GYM_SCOPE_CHANGES.md).
-- Viết idempotent (IF NOT EXISTS) vì một số DB đã được `db push` trước đó.

-- Khóa học nháp (wizard tự lưu)
ALTER TYPE "ClassApprovalStatus" ADD VALUE IF NOT EXISTS 'DRAFT';

-- Hoàn tiền ngoại lệ khi hủy khóa muộn + hủy buổi bị HLV dời lịch
ALTER TYPE "RefundReason" ADD VALUE IF NOT EXISTS 'MEMBER_CANCEL_COURSE_LATE';
ALTER TYPE "RefundReason" ADD VALUE IF NOT EXISTS 'SESSION_RESCHEDULED';

-- Khóa học: mục tiêu (tag), trình độ, ngày khai giảng/kết thúc, dữ liệu nháp
ALTER TABLE "Class" ADD COLUMN IF NOT EXISTS "draftData" JSONB,
ADD COLUMN IF NOT EXISTS "endDate" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "goalTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "targetLevel" "TrainingLevel";

-- Buổi học: dời lịch bởi HLV
ALTER TABLE "ClassSchedule" ADD COLUMN IF NOT EXISTS "originalStartTime" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "rescheduleCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "rescheduleReason" TEXT,
ADD COLUMN IF NOT EXISTS "rescheduledAt" TIMESTAMP(3);

-- Đánh giá: chỉ được sửa 1 lần
ALTER TABLE "CoachFeedback" ADD COLUMN IF NOT EXISTS "editCount" INTEGER NOT NULL DEFAULT 0;

-- Đổi buổi sang khóa tương đương
ALTER TABLE "Enrollment" ADD COLUMN IF NOT EXISTS "sourceClassId" TEXT,
ADD COLUMN IF NOT EXISTS "transferredFromId" TEXT;

-- Mục tiêu tập luyện của hội viên (danh mục gợi ý)
ALTER TABLE "MemberProfile" ADD COLUMN IF NOT EXISTS "fitnessGoals" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Ảnh chụp mặt hàng tại thời điểm mua
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "purchaseSnapshot" JSONB;

-- Hoàn tiền: cột ngân hàng (commit 6213df2 chưa có migration) + phí chiết khấu hoàn ngoại lệ
ALTER TABLE "Refund" ADD COLUMN IF NOT EXISTS "bankAccountName" TEXT,
ADD COLUMN IF NOT EXISTS "bankAccountNumber" TEXT,
ADD COLUMN IF NOT EXISTS "bankName" TEXT,
ADD COLUMN IF NOT EXISTS "feePercent" INTEGER,
ADD COLUMN IF NOT EXISTS "grossAmount" DECIMAL(12,2);

-- Phòng tập: tầng + chỉ dẫn
ALTER TABLE "Room" ADD COLUMN IF NOT EXISTS "directions" TEXT,
ADD COLUMN IF NOT EXISTS "floor" TEXT;

-- Sổ địa chỉ: mã địa danh
ALTER TABLE "UserAddress" ADD COLUMN IF NOT EXISTS "provinceCode" INTEGER,
ADD COLUMN IF NOT EXISTS "wardCode" INTEGER;

-- Thông tin trung tâm
CREATE TABLE IF NOT EXISTS "CenterSetting" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "mapUrl" TEXT,
    "hotline" TEXT,
    "email" TEXT,
    "openingHours" TEXT,
    "parkingNote" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CenterSetting_pkey" PRIMARY KEY ("id")
);

INSERT INTO "CenterSetting" ("id", "name", "address", "openingHours", "updatedAt")
VALUES ('default', 'Pulse Gym Center', 'Cập nhật địa chỉ trung tâm tại Web quản trị › Cài đặt trung tâm', '05:30 – 22:00 hằng ngày', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- Backfill: ngày khai giảng / kết thúc từ lịch (buổi chưa hủy)
UPDATE "Class" c SET "startDate" = s.min_start, "endDate" = s.max_end
FROM (
  SELECT "classId", MIN("startTime") AS min_start, MAX("endTime") AS max_end
  FROM "ClassSchedule" WHERE "status" <> 'CANCELLED' GROUP BY "classId"
) s
WHERE s."classId" = c."id" AND c."startDate" IS NULL;

-- Backfill: snapshot tối thiểu cho giao dịch khóa học cũ (tên lúc mua + số tiền đã trả)
UPDATE "Payment" p SET "purchaseSnapshot" = jsonb_build_object(
  'kind', 'CLASS',
  'classId', p."classId",
  'name', COALESCE(p."classNameSnapshot", c."name"),
  'price', p."amount",
  'classType', c."classType",
  'backfilled', true
)
FROM "Class" c
WHERE p."classId" = c."id" AND p."purchaseSnapshot" IS NULL;
