-- BaseEntity: mọi bảng có id (UUID), "createdAt", "updatedAt" — "updatedAt" thống nhất DEFAULT CURRENT_TIMESTAMP.
-- Idempotent (IF NOT EXISTS / kiểm tra cột) vì DB có thể đã từng được tạo bằng `db push`.

-- (1) 9 bảng chưa có "updatedAt": thêm cột, giá trị ban đầu = "createdAt" (bản ghi cũ coi như chưa từng sửa).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'RefreshToken' AND column_name = 'updatedAt'
  ) THEN
    ALTER TABLE "RefreshToken" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
    UPDATE "RefreshToken" SET "updatedAt" = "createdAt";
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'ClassMember' AND column_name = 'updatedAt'
  ) THEN
    ALTER TABLE "ClassMember" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
    UPDATE "ClassMember" SET "updatedAt" = "createdAt";
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'SepayBankTransaction' AND column_name = 'updatedAt'
  ) THEN
    ALTER TABLE "SepayBankTransaction" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
    UPDATE "SepayBankTransaction" SET "updatedAt" = "createdAt";
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'NotificationOutbox' AND column_name = 'updatedAt'
  ) THEN
    ALTER TABLE "NotificationOutbox" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
    UPDATE "NotificationOutbox" SET "updatedAt" = "createdAt";
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'SepayWebhookEvent' AND column_name = 'updatedAt'
  ) THEN
    ALTER TABLE "SepayWebhookEvent" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
    UPDATE "SepayWebhookEvent" SET "updatedAt" = "createdAt";
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'ChatAttachment' AND column_name = 'updatedAt'
  ) THEN
    ALTER TABLE "ChatAttachment" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
    UPDATE "ChatAttachment" SET "updatedAt" = "createdAt";
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'AttendanceManualCode' AND column_name = 'updatedAt'
  ) THEN
    ALTER TABLE "AttendanceManualCode" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
    UPDATE "AttendanceManualCode" SET "updatedAt" = "createdAt";
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'AttendanceManualCodeAttempt' AND column_name = 'updatedAt'
  ) THEN
    ALTER TABLE "AttendanceManualCodeAttempt" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
    UPDATE "AttendanceManualCodeAttempt" SET "updatedAt" = "createdAt";
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'Notification' AND column_name = 'updatedAt'
  ) THEN
    ALTER TABLE "Notification" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
    UPDATE "Notification" SET "updatedAt" = "createdAt";
  END IF;
END $$;

-- (2) 23 bảng đã có "updatedAt": chỉ thêm DEFAULT cho thống nhất (không đổi dữ liệu).
ALTER TABLE "User" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "MemberProfile" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "CoachProfile" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ManagerProfile" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Fitness" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Room" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Class" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ClassSchedule" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Enrollment" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Payment" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Invoice" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ChatMessage" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Attendance" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "AttendancePenalty" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "TrainingPlan" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "TrainingResult" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "CoachFeedback" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "CoachWallet" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "WalletTransaction" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Refund" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Product" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ProductReview" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ProductOrder" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
