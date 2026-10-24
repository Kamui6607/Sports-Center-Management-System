-- Địa giới 2 cấp: Quận/Huyện không còn bắt buộc. Idempotent (DROP NOT NULL chạy lại an toàn).
ALTER TABLE "UserAddress" ALTER COLUMN "district" DROP NOT NULL;
