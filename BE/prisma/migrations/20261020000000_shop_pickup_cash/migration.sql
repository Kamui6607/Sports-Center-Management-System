-- Cửa hàng: ngày dự định lấy hàng, thanh toán tại quầy (CASH), đổi lịch lấy, nhắc hạn,
-- khóa "trả tại quầy" khi bùng hàng nhiều lần, cách trả tiền hoàn + nhắc khách gửi STK.

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'CONFIRMED';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'SEPAY',
ADD COLUMN     "pickupReminderSentAt" TIMESTAMP(3),
ADD COLUMN     "pickupRescheduleCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "preferredPickupDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Refund" ADD COLUMN     "bankInfoRequestedAt" TIMESTAMP(3),
ADD COLUMN     "payoutMethod" "PaymentMethod";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "cashPickupLockedUntil" TIMESTAMP(3);
