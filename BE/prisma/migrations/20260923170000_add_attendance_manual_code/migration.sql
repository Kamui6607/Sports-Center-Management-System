-- Mã dự phòng nhập tay cho Member không quét được QR (camera/điện thoại lỗi).
-- Sinh cùng lượt với QR ở POST /attendance/generate-qr; TTL ngắn, mã cũ cùng schedule bị thu hồi
-- khi cấp mã mới; `attempts` đếm số lần nhập sai để vô hiệu hoá mã khi bị dò.
-- KHÔNG đụng dữ liệu Attendance / Enrollment / MembershipSubscription hiện có.

-- CreateTable
CREATE TABLE "AttendanceManualCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceManualCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- Log mọi lần thử nhập mã (kể cả sai/hết hạn) để rate-limit theo member + audit.
CREATE TABLE "AttendanceManualCodeAttempt" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "codeId" TEXT,
    "success" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceManualCodeAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceManualCode_code_key" ON "AttendanceManualCode"("code");

-- CreateIndex
CREATE INDEX "AttendanceManualCode_scheduleId_expiresAt_idx" ON "AttendanceManualCode"("scheduleId", "expiresAt");

-- CreateIndex
CREATE INDEX "AttendanceManualCode_createdBy_idx" ON "AttendanceManualCode"("createdBy");

-- CreateIndex
CREATE INDEX "AttendanceManualCodeAttempt_memberId_createdAt_idx" ON "AttendanceManualCodeAttempt"("memberId", "createdAt");

-- AddForeignKey
ALTER TABLE "AttendanceManualCode" ADD CONSTRAINT "AttendanceManualCode_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ClassSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceManualCode" ADD CONSTRAINT "AttendanceManualCode_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceManualCodeAttempt" ADD CONSTRAINT "AttendanceManualCodeAttempt_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "MemberProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceManualCodeAttempt" ADD CONSTRAINT "AttendanceManualCodeAttempt_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "AttendanceManualCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
