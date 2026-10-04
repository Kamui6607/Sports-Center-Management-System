-- Liên kết thanh toán (Payment) với đơn mua sản phẩm (ProductOrder) để dùng chung luồng SePay + hóa đơn.

-- ── (0) Bảng sản phẩm ───────────────────────────────────────────────────────────
-- Các bảng Product/ProductReview/ProductOrder có trong schema.prisma nhưng CHƯA từng có migration
-- (có thể đã được tạo bằng `prisma db push`). Tạo kiểu IF NOT EXISTS: DB đã có thì bỏ qua, chưa có thì tạo,
-- đúng cấu trúc Prisma sinh ra cho các model này.
DO $$ BEGIN
  CREATE TYPE "ProductOrderStatus" AS ENUM ('PENDING', 'SUCCESS', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "stockQuantity" INTEGER NOT NULL DEFAULT 0,
    "rating" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ProductReview" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductReview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ProductOrder" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "totalPrice" DECIMAL(12,2) NOT NULL,
    "status" "ProductOrderStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProductReview_productId_userId_key" ON "ProductReview"("productId", "userId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Product_createdById_fkey') THEN
    ALTER TABLE "Product" ADD CONSTRAINT "Product_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductReview_productId_fkey') THEN
    ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductReview_userId_fkey') THEN
    ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductOrder_productId_fkey') THEN
    ALTER TABLE "ProductOrder" ADD CONSTRAINT "ProductOrder_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductOrder_userId_fkey') THEN
    ALTER TABLE "ProductOrder" ADD CONSTRAINT "ProductOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- ── (1) Payment: người mua có thể không phải hội viên + liên kết đơn sản phẩm ─────
ALTER TABLE "Payment" ALTER COLUMN "memberId" DROP NOT NULL;
ALTER TABLE "Payment" ADD COLUMN "productOrderId" TEXT;
CREATE UNIQUE INDEX "Payment_productOrderId_key" ON "Payment"("productOrderId");
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_productOrderId_fkey" FOREIGN KEY ("productOrderId") REFERENCES "ProductOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- Một giao dịch chỉ thanh toán cho MỘT thứ: lớp học HOẶC đơn sản phẩm (không được cả hai).
-- Cột "classId" cũng chưa từng có migration (DB có thể tạo bằng db push) ⇒ chỉ thêm ràng buộc khi cột tồn tại.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = current_schema() AND table_name = 'Payment' AND column_name = 'classId')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Payment_single_target_check') THEN
    ALTER TABLE "Payment" ADD CONSTRAINT "Payment_single_target_check" CHECK ("classId" IS NULL OR "productOrderId" IS NULL);
  END IF;
END $$;

-- ── (2) Invoice: hóa đơn sản phẩm (người mua có thể là HLV) + snapshot tên sản phẩm ─
ALTER TABLE "Invoice" ALTER COLUMN "memberId" DROP NOT NULL;
ALTER TABLE "Invoice" ADD COLUMN "productName" TEXT;
