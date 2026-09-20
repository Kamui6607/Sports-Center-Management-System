-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'MEMBER_REGISTERED';
ALTER TYPE "NotificationType" ADD VALUE 'CHAT_MESSAGE';
ALTER TYPE "NotificationType" ADD VALUE 'SUBSCRIPTION_CANCELLED';
ALTER TYPE "NotificationType" ADD VALUE 'UPCOMING_CLASS';
ALTER TYPE "NotificationType" ADD VALUE 'TRAINING_PLAN_ASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE 'NEW_CLASS';

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "reason" TEXT;
