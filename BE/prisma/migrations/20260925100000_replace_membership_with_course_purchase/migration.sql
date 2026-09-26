-- ============================================================================
-- Nền tảng hóa hệ thống: bỏ role STAFF (lễ tân) và bỏ Membership
-- → chuyển sang mô hình MEMBER mua KHÓA HỌC của COACH (hoa hồng 15% khấu trừ).
--
-- Lưu ý phạm vi: migration này CHỈ xử lý role STAFF + Membership → CoursePurchase.
-- Các object ngoài schema (SepayWebhookEvent, Payment.gateway*) không thuộc phạm vi
-- thay đổi này nên được giữ nguyên.
-- ============================================================================

-- ── 1. Dọn dữ liệu trước khi thu hẹp enum ───────────────────────────────────
-- ChatMessage.senderId là FK RESTRICT → phải xoá tin nhắn do tài khoản STAFF gửi
-- thì mới xoá được user. Các FK khác là CASCADE hoặc SET NULL nên xử lý tự động.
DELETE FROM "ChatMessage"
WHERE "senderId" IN (SELECT "id" FROM "User" WHERE "role" = 'STAFF');

-- Bỏ tài khoản lễ tân: role STAFF không còn tồn tại trong hệ thống.
DELETE FROM "User" WHERE "role" = 'STAFF';

-- ── 2. NotificationType: mở rộng tạm → map dữ liệu → thu hẹp ────────────────
-- Bước 2a: type tạm giữ CẢ giá trị cũ (SUBSCRIPTION_*) lẫn mới (COURSE_*) để cast hợp lệ.
BEGIN;
CREATE TYPE "NotificationType_stage" AS ENUM ('MEMBER_REGISTERED', 'COACH_REGISTERED', 'CHAT_MESSAGE', 'COURSE_PURCHASED', 'COURSE_SOLD', 'COURSE_EXPIRING', 'COURSE_EXPIRED', 'COURSE_CANCELLED', 'SUBSCRIPTION_EXPIRING', 'SUBSCRIPTION_EXPIRED', 'SUBSCRIPTION_CANCELLED', 'UPCOMING_CLASS', 'SCHEDULE_CANCELLED', 'SCHEDULE_UPDATED', 'ENROLLMENT_CONFIRMED', 'ENROLLMENT_CANCELLED', 'TRAINING_PLAN_ASSIGNED', 'NEW_CLASS', 'COACH_CHANGED', 'ATTENDANCE_WARNING', 'ATTENDANCE_PENALTY', 'ATTENDANCE_PENALTY_REVOKED', 'SCHEDULE_ROOM_CHANGED', 'PAYMENT_SUCCESS', 'PAYMENT_REFUNDED', 'GENERAL');
ALTER TABLE "Notification" ALTER COLUMN "type" TYPE "NotificationType_stage" USING ("type"::text::"NotificationType_stage");
ALTER TYPE "NotificationType" RENAME TO "NotificationType_old";
ALTER TYPE "NotificationType_stage" RENAME TO "NotificationType";
DROP TYPE "NotificationType_old";
COMMIT;

-- Bước 2b: giữ lịch sử thông báo — ánh xạ thông báo gói tập cũ sang thông báo khóa học.
UPDATE "Notification" SET "type" = 'COURSE_EXPIRING' WHERE "type" = 'SUBSCRIPTION_EXPIRING';
UPDATE "Notification" SET "type" = 'COURSE_EXPIRED'  WHERE "type" = 'SUBSCRIPTION_EXPIRED';
UPDATE "Notification" SET "type" = 'COURSE_CANCELLED' WHERE "type" = 'SUBSCRIPTION_CANCELLED';

-- Bước 2c: thu hẹp enum về đúng schema (bỏ SUBSCRIPTION_*).
BEGIN;
CREATE TYPE "NotificationType_final" AS ENUM ('MEMBER_REGISTERED', 'COACH_REGISTERED', 'CHAT_MESSAGE', 'COURSE_PURCHASED', 'COURSE_SOLD', 'COURSE_EXPIRING', 'COURSE_EXPIRED', 'COURSE_CANCELLED', 'UPCOMING_CLASS', 'SCHEDULE_CANCELLED', 'SCHEDULE_UPDATED', 'ENROLLMENT_CONFIRMED', 'ENROLLMENT_CANCELLED', 'TRAINING_PLAN_ASSIGNED', 'NEW_CLASS', 'COACH_CHANGED', 'ATTENDANCE_WARNING', 'ATTENDANCE_PENALTY', 'ATTENDANCE_PENALTY_REVOKED', 'SCHEDULE_ROOM_CHANGED', 'PAYMENT_SUCCESS', 'PAYMENT_REFUNDED', 'GENERAL');
ALTER TABLE "Notification" ALTER COLUMN "type" TYPE "NotificationType_final" USING ("type"::text::"NotificationType_final");
ALTER TYPE "NotificationType" RENAME TO "NotificationType_old";
ALTER TYPE "NotificationType_final" RENAME TO "NotificationType";
DROP TYPE "NotificationType_old";
COMMIT;

-- AlterEnum: UserRole chỉ còn MEMBER | COACH | MANAGER
BEGIN;
CREATE TYPE "UserRole_new" AS ENUM ('MEMBER', 'COACH', 'MANAGER');
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole_new" USING ("role"::text::"UserRole_new");
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "UserRole_old";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'MEMBER';
COMMIT;

-- ── 3. Gỡ liên kết Membership khỏi Payment ──────────────────────────────────
-- DropForeignKey
ALTER TABLE "MembershipSubscription" DROP CONSTRAINT "MembershipSubscription_memberId_fkey";

-- DropForeignKey
ALTER TABLE "MembershipSubscription" DROP CONSTRAINT "MembershipSubscription_planId_fkey";

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_planId_fkey";

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_subscriptionId_fkey";

-- DropIndex
DROP INDEX "Payment_subscriptionId_idx";

-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "planId",
DROP COLUMN "subscriptionId",
ADD COLUMN     "coursePurchaseId" TEXT;

-- ── 4. Xoá bảng/enum Membership ─────────────────────────────────────────────
-- DropTable
DROP TABLE "MembershipSubscription";

-- DropTable
DROP TABLE "MembershipPlan";

-- DropEnum
DROP TYPE "MemberTier";

-- DropEnum
DROP TYPE "MembershipStatus";

-- ── 5. Khóa học & lượt mua ──────────────────────────────────────────────────
-- CreateEnum
CREATE TYPE "CoursePurchaseStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "CoursePurchase" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "coachId" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "commissionRate" DOUBLE PRECISION NOT NULL DEFAULT 0.15,
    "commissionAmount" DECIMAL(12,2) NOT NULL,
    "coachEarning" DECIMAL(12,2) NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "status" "CoursePurchaseStatus" NOT NULL DEFAULT 'ACTIVE',
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoursePurchase_pkey" PRIMARY KEY ("id")
);

-- AlterTable: Class gắn giá + thời hạn + Coach sở hữu khóa học
ALTER TABLE "Class" ADD COLUMN     "durationDays" INTEGER,
ADD COLUMN     "ownerCoachId" TEXT,
ADD COLUMN     "price" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable: Invoice snapshot theo khóa học thay vì gói tập
ALTER TABLE "Invoice" DROP COLUMN "planName",
DROP COLUMN "planTier",
ADD COLUMN     "courseName" TEXT;

-- CreateIndex
CREATE INDEX "CoursePurchase_memberId_idx" ON "CoursePurchase"("memberId");

-- CreateIndex
CREATE INDEX "CoursePurchase_classId_idx" ON "CoursePurchase"("classId");

-- CreateIndex
CREATE INDEX "CoursePurchase_coachId_idx" ON "CoursePurchase"("coachId");

-- CreateIndex
CREATE INDEX "CoursePurchase_status_idx" ON "CoursePurchase"("status");

-- CreateIndex
CREATE INDEX "CoursePurchase_endDate_idx" ON "CoursePurchase"("endDate");

-- CreateIndex
CREATE INDEX "Class_ownerCoachId_idx" ON "Class"("ownerCoachId");

-- CreateIndex
CREATE INDEX "Payment_coursePurchaseId_idx" ON "Payment"("coursePurchaseId");

-- AddForeignKey
ALTER TABLE "CoursePurchase" ADD CONSTRAINT "CoursePurchase_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "MemberProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoursePurchase" ADD CONSTRAINT "CoursePurchase_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoursePurchase" ADD CONSTRAINT "CoursePurchase_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "CoachProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Class" ADD CONSTRAINT "Class_ownerCoachId_fkey" FOREIGN KEY ("ownerCoachId") REFERENCES "CoachProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_coursePurchaseId_fkey" FOREIGN KEY ("coursePurchaseId") REFERENCES "CoursePurchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
