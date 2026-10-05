-- Tách vai trò người dùng ra bảng "Role" (bảng tra cứu) thay cho enum "UserRole" trên "User".
-- Idempotent để chạy an toàn cả trên DB từng tạo bằng `db push`.

-- (1) Bảng Role (kế thừa BaseEntity: id, createdAt, updatedAt)
CREATE TABLE IF NOT EXISTS "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Role_name_key" ON "Role"("name");

-- (2) 3 vai trò hệ thống
INSERT INTO "Role" ("id", "name", "description") VALUES
    (gen_random_uuid()::text, 'MEMBER',  'Hội viên — mua khóa học, đặt lịch, điểm danh'),
    (gen_random_uuid()::text, 'COACH',   'Huấn luyện viên — mở lớp, dạy, nhận 85% doanh thu'),
    (gen_random_uuid()::text, 'MANAGER', 'Quản lý trung tâm — toàn quyền quản trị')
ON CONFLICT ("name") DO NOTHING;

-- (3) User.roleId: thêm cột, chép từ enum cũ, ép NOT NULL + khóa ngoại
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "roleId" TEXT;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'User' AND column_name = 'role'
  ) THEN
    UPDATE "User" u SET "roleId" = r."id"
    FROM "Role" r
    WHERE r."name" = u."role"::text AND u."roleId" IS NULL;
  END IF;
END $$;

ALTER TABLE "User" ALTER COLUMN "roleId" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "User_roleId_idx" ON "User"("roleId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'User_roleId_fkey') THEN
    ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey"
      FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- (4) Bỏ cột enum cũ
ALTER TABLE "User" DROP COLUMN IF EXISTS "role";
DROP TYPE IF EXISTS "UserRole";
