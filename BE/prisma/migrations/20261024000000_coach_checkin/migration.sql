-- Check-in phòng gym của HLV (xem Doc/COACH_TERMS.md §10): Manager tạo QR, HLV quét ⇒ ghi 1 ngày dùng phòng,
-- quá hạn mức miễn phí (hoặc HLV chưa đạt kỳ) thì trừ phí từ tiền ròng của khóa cũ nhất còn dư.
-- Viết idempotent (IF NOT EXISTS / DO ... EXCEPTION) vì DB Render dùng chung cả nhóm.
-- Chỉ THÊM: 1 giá trị enum, 1 cột có DEFAULT, 1 bảng — không DROP, không DELETE.

-- Loại giao dịch ví: phí check-in
ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'CHECKIN_FEE';

-- Nợ phí check-in khi ví chưa đủ tiền để trừ
ALTER TABLE "CoachWallet" ADD COLUMN IF NOT EXISTS "feeDebt" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Nhật ký ngày dùng phòng
CREATE TABLE IF NOT EXISTS "CoachCheckIn" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "monthKey" TEXT NOT NULL,
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dayIndex" INTEGER NOT NULL,
    "free" BOOLEAN NOT NULL,
    "feeAssessed" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "feeCharged" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "feeDebt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "termState" "CoachTermState",
    "qrIssuedBy" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachCheckIn_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CoachCheckIn_coachId_monthKey_idx" ON "CoachCheckIn"("coachId", "monthKey");
CREATE INDEX IF NOT EXISTS "CoachCheckIn_dayKey_idx" ON "CoachCheckIn"("dayKey");
CREATE UNIQUE INDEX IF NOT EXISTS "CoachCheckIn_coachId_dayKey_key" ON "CoachCheckIn"("coachId", "dayKey");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CoachCheckIn_coachId_fkey') THEN
    ALTER TABLE "CoachCheckIn" ADD CONSTRAINT "CoachCheckIn_coachId_fkey"
      FOREIGN KEY ("coachId") REFERENCES "CoachProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
