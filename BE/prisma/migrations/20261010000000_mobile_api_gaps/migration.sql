-- Bổ sung API cho Mobile (Doc/BE_API_CHANGES.md):
--   A    PasswordResetOtp           — OTP 6 số đặt lại mật khẩu (lưu hash, hết hạn, giới hạn lần sai)
--   BE-2 Class.rejectReason         — lý do Manager từ chối khóa học
--   BE-6 Product.imageUrl           — ảnh sản phẩm
--   BE-20 ClassSchedule.cancelReason / cancelResolution — lý do & phương án hủy buổi
--   BE-21 Order.cancelReason        — người mua hủy / hết hạn / Manager hủy
--   L8   Refund.memberNote / managerNote — tách ghi chú (cột `note` cũ giữ nguyên cho Web)
-- Chỉ THÊM cột/bảng (nullable) ⇒ không ảnh hưởng dữ liệu & code cũ.

-- CreateEnum
CREATE TYPE "ScheduleCancelResolution" AS ENUM ('MAKEUP', 'REFUND');

-- CreateEnum
CREATE TYPE "OrderCancelReason" AS ENUM ('BUYER', 'EXPIRED', 'MANAGER');

-- AlterTable
ALTER TABLE "Class" ADD COLUMN     "rejectReason" TEXT;

-- AlterTable
ALTER TABLE "ClassSchedule" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelResolution" "ScheduleCancelResolution";

-- AlterTable
ALTER TABLE "Refund" ADD COLUMN     "managerNote" TEXT,
ADD COLUMN     "memberNote" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "imageUrl" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cancelReason" "OrderCancelReason";

-- CreateTable
CREATE TABLE "PasswordResetOtp" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "otpHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetOtp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetOtp_userId_key" ON "PasswordResetOtp"("userId");

-- AddForeignKey
ALTER TABLE "PasswordResetOtp" ADD CONSTRAINT "PasswordResetOtp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill L8: cột `note` cũ = ghi chú Member khi gửi, bị ghi đè bằng ghi chú Manager nếu duyệt kèm ghi chú.
-- Yêu cầu chưa duyệt / bị từ chối ⇒ `note` là của Member; đã hoàn tất (Manager xử lý) ⇒ coi là của Manager.
UPDATE "Refund" SET "memberNote" = "note" WHERE "note" IS NOT NULL AND "status" <> 'COMPLETED';
UPDATE "Refund" SET "managerNote" = "note" WHERE "note" IS NOT NULL AND "status" = 'COMPLETED' AND "processedById" IS NOT NULL;

-- Backfill BE-21: đơn đã hủy trước đây — phân loại theo ghi chú của giao dịch (FAILED) do BE ghi lúc hủy.
UPDATE "Order" o SET "cancelReason" = 'EXPIRED'
FROM "Payment" p
WHERE p."orderId" = o."id" AND o."status" = 'CANCELLED' AND o."cancelReason" IS NULL AND p."note" LIKE 'Hết hạn chờ thanh toán%';
UPDATE "Order" SET "cancelReason" = 'BUYER' WHERE "status" = 'CANCELLED' AND "cancelReason" IS NULL;
