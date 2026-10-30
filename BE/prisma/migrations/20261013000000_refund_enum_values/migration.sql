-- Hủy khóa theo mốc 3 ngày + hủy buổi lẻ hoàn 80% + người dùng tự hủy yêu cầu hoàn tiền.
-- Giá trị enum mới chỉ được DÙNG từ các request sau khi migration commit (không dùng trong chính migration này).
ALTER TYPE "RefundReason" ADD VALUE IF NOT EXISTS 'MEMBER_CANCEL_SESSION';
ALTER TYPE "RefundStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
