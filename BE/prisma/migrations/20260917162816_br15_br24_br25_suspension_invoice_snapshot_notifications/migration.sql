-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('SCHEDULE_CANCELLED', 'SCHEDULE_UPDATED', 'SUBSCRIPTION_EXPIRING', 'SUBSCRIPTION_EXPIRED', 'PAYMENT_SUCCESS', 'PAYMENT_REFUNDED', 'ENROLLMENT_CONFIRMED', 'ENROLLMENT_CANCELLED', 'GENERAL');

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "memberName" TEXT,
ADD COLUMN     "planName" TEXT,
ADD COLUMN     "planTier" TEXT;

-- AlterTable
ALTER TABLE "MembershipSubscription" ADD COLUMN     "remainingDays" INTEGER,
ADD COLUMN     "suspendedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_isRead_idx" ON "Notification"("isRead");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
