-- A10: mốc hủy gói phục vụ entitlement lịch sử (analytics chuyên cần không được thay đổi quá khứ).
-- Additive & nullable: dữ liệu cũ NULL ⇒ fallback dùng endDate như trước.

ALTER TABLE "MembershipSubscription" ADD COLUMN "cancelledAt" TIMESTAMP(3);
