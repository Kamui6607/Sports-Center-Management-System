-- Siết chặt nghiệp vụ (Doc/BUSINESS_HARDENING_PLAN.md): vòng đời khóa học, hoàn phần thiếu khi ghi danh,
-- ảnh chụp người bán/người mua cho hóa đơn.
-- Viết idempotent (IF NOT EXISTS) vì DB Render dùng chung cả nhóm. Chỉ THÊM cột/giá trị enum + backfill JSON.

-- Lý do hoàn: đã thu tiền khóa nhưng không ghi danh đủ số buổi đã tính tiền
ALTER TYPE "RefundReason" ADD VALUE IF NOT EXISTS 'COURSE_NOT_FULFILLED';

-- Khóa học: bậc cảnh báo "chưa có học viên" + lý do/thời điểm hệ thống tự đóng
ALTER TABLE "Class" ADD COLUMN IF NOT EXISTS "alertStage" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "closedReason" TEXT,
ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3);

-- Buổi học: mã hủy do hệ thống (không tính vào tỷ lệ hủy buổi của HLV)
ALTER TABLE "ClassSchedule" ADD COLUMN IF NOT EXISTS "cancelCode" TEXT;

-- Backfill: giao dịch đơn hàng chưa có snapshot ⇒ gắn loại ORDER
UPDATE "Payment" SET "purchaseSnapshot" = jsonb_build_object('kind', 'ORDER', 'orderId', "orderId", 'backfilled', true)
WHERE "orderId" IS NOT NULL AND "purchaseSnapshot" IS NULL;

-- Backfill: người bán (thông tin trung tâm hiện có — tốt nhất còn lại cho giao dịch cũ)
UPDATE "Payment" p SET "purchaseSnapshot" = p."purchaseSnapshot" || jsonb_build_object(
  'seller', jsonb_build_object('name', cs."name", 'address', cs."address", 'hotline', cs."hotline", 'email', cs."email")
)
FROM "CenterSetting" cs
WHERE cs."id" = 'default' AND p."purchaseSnapshot" IS NOT NULL AND NOT (p."purchaseSnapshot" ? 'seller');

-- Backfill: người mua (hội viên của giao dịch, hoặc người đặt đơn hàng)
UPDATE "Payment" p SET "purchaseSnapshot" = p."purchaseSnapshot" || jsonb_build_object(
  'buyer', jsonb_build_object('userId', u."id", 'fullName', u."fullName", 'phone', u."phone", 'email', u."email")
)
FROM "User" u
WHERE p."purchaseSnapshot" IS NOT NULL AND NOT (p."purchaseSnapshot" ? 'buyer')
  AND u."id" = COALESCE(
    (SELECT mp."userId" FROM "MemberProfile" mp WHERE mp."id" = p."memberId"),
    (SELECT o."userId" FROM "Order" o WHERE o."id" = p."orderId")
  );
