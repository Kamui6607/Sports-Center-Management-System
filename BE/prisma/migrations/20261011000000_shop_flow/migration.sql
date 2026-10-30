-- ─────────────────────────────────────────────────────────────────────────────
-- Cửa hàng: giỏ hàng, sổ địa chỉ, máy trạng thái đơn, nhật ký kho, đánh giá theo dòng đơn.
-- Thiết kế: Doc/SHOP_FLOW_DESIGN.md. Chuyển dữ liệu cũ (an toàn khi chạy trên DB đang có đơn):
--   * OrderStatus: PENDING → PENDING_PAYMENT, SUCCESS → COMPLETED,
--     CANCELLED (cancelReason = EXPIRED) → EXPIRED, CANCELLED khác → CANCELLED.
--   * Product.stockQuantity trước đây đã TRỪ hàng đang giữ ⇒ cộng trả và ghi vào reservedStock.
--   * Order.code / subtotal / mốc thời gian / snapshot OrderItem được điền từ dữ liệu sẵn có.
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "FulfillmentType" AS ENUM ('PICKUP', 'DELIVERY');

-- CreateEnum
CREATE TYPE "InventoryTransactionType" AS ENUM ('IN', 'RESERVE', 'RELEASE', 'SALE', 'RETURN', 'ADJUST');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'ORDER_UPDATED';

-- AlterEnum
ALTER TYPE "RefundReason" ADD VALUE 'ORDER_CANCELLED';
ALTER TYPE "RefundReason" ADD VALUE 'ORDER_NOT_PICKED_UP';
ALTER TYPE "RefundReason" ADD VALUE 'ORDER_LATE_PAYMENT';

-- AlterEnum: OrderStatus (đổi toàn bộ giá trị, ánh xạ dữ liệu cũ)
CREATE TYPE "OrderStatus_new" AS ENUM ('PENDING_PAYMENT', 'PAID', 'PROCESSING', 'READY_FOR_PICKUP', 'SHIPPING', 'DELIVERED', 'COMPLETED', 'EXPIRED', 'CANCELLED', 'NOT_PICKED_UP', 'REFUND_REQUESTED', 'REFUNDED');
ALTER TABLE "Order" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Order" ALTER COLUMN "status" TYPE "OrderStatus_new" USING (
  CASE
    WHEN "status"::text = 'PENDING' THEN 'PENDING_PAYMENT'
    WHEN "status"::text = 'SUCCESS' THEN 'COMPLETED'
    WHEN "status"::text = 'CANCELLED' AND "cancelReason"::text = 'EXPIRED' THEN 'EXPIRED'
    ELSE 'CANCELLED'
  END
)::"OrderStatus_new";
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";
DROP TYPE "OrderStatus_old";
ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'PENDING_PAYMENT';

-- DropIndex (mỗi DÒNG ĐƠN một đánh giá thay cho mỗi người một đánh giá / sản phẩm)
DROP INDEX "ProductReview_productId_userId_key";

-- AlterTable: Order
ALTER TABLE "Order" ADD COLUMN     "cancelNote" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" TEXT,
ADD COLUMN     "carrier" TEXT,
ADD COLUMN     "code" TEXT,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "expiredAt" TIMESTAMP(3),
ADD COLUMN     "fulfillmentType" "FulfillmentType" NOT NULL DEFAULT 'PICKUP',
ADD COLUMN     "idempotencyHash" TEXT,
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "notPickedUpAt" TIMESTAMP(3),
ADD COLUMN     "note" TEXT,
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "paymentExpiresAt" TIMESTAMP(3),
ADD COLUMN     "pickupCodeHash" TEXT,
ADD COLUMN     "pickupCodeNonce" TEXT,
ADD COLUMN     "pickupDeadline" TIMESTAMP(3),
ADD COLUMN     "pickupFailedAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pickupLockedUntil" TIMESTAMP(3),
ADD COLUMN     "processingAt" TIMESTAMP(3),
ADD COLUMN     "readyAt" TIMESTAMP(3),
ADD COLUMN     "recipientName" TEXT,
ADD COLUMN     "recipientPhone" TEXT,
ADD COLUMN     "refundedAt" TIMESTAMP(3),
ADD COLUMN     "shippedAt" TIMESTAMP(3),
ADD COLUMN     "shippingAddress" TEXT,
ADD COLUMN     "shippingFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "shippingProvince" TEXT,
ADD COLUMN     "subtotal" DECIMAL(12,2),
ADD COLUMN     "trackingCode" TEXT;

-- Dữ liệu cũ: mã đơn, tạm tính, người nhận, mốc thời gian.
UPDATE "Order" o SET
  "code" = 'DH' || UPPER(SUBSTRING(REPLACE(o."id", '-', '') FROM 1 FOR 10)),
  "subtotal" = o."totalPrice",
  "recipientName" = u."fullName",
  "recipientPhone" = u."phone"
FROM "User" u
WHERE u."id" = o."userId";

UPDATE "Order" o SET "paidAt" = p."paidAt", "completedAt" = COALESCE(p."paidAt", o."updatedAt")
FROM "Payment" p
WHERE p."orderId" = o."id" AND o."status" = 'COMPLETED';

UPDATE "Order" SET "completedAt" = "updatedAt" WHERE "status" = 'COMPLETED' AND "completedAt" IS NULL;

UPDATE "Order" o SET "paymentExpiresAt" = COALESCE(p."createdAt", o."createdAt") + INTERVAL '15 minutes'
FROM "Payment" p
WHERE p."orderId" = o."id" AND o."status" = 'PENDING_PAYMENT';
UPDATE "Order" SET "paymentExpiresAt" = "createdAt" + INTERVAL '15 minutes'
WHERE "status" = 'PENDING_PAYMENT' AND "paymentExpiresAt" IS NULL;

UPDATE "Order" SET "expiredAt" = "updatedAt" WHERE "status" = 'EXPIRED';
UPDATE "Order" SET "cancelledAt" = "updatedAt" WHERE "status" = 'CANCELLED';

ALTER TABLE "Order" ALTER COLUMN "code" SET NOT NULL;
ALTER TABLE "Order" ALTER COLUMN "subtotal" SET NOT NULL;

-- AlterTable: OrderItem (snapshot tên/ảnh)
ALTER TABLE "OrderItem" ADD COLUMN     "productImageUrl" TEXT,
ADD COLUMN     "productName" TEXT;

UPDATE "OrderItem" oi SET "productName" = p."name", "productImageUrl" = p."imageUrl"
FROM "Product" p
WHERE p."id" = oi."productId";

-- AlterTable: Product
ALTER TABLE "Product" ADD COLUMN     "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "lowStockThreshold" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "maxPerDay" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "maxPerOrder" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "reservedStock" INTEGER NOT NULL DEFAULT 0;

-- stockQuantity cũ = số còn bán được (đã trừ hàng đang giữ) ⇒ tồn thực tế = cũ + đang giữ.
UPDATE "Product" p SET
  "reservedStock" = held.qty,
  "stockQuantity" = p."stockQuantity" + held.qty
FROM (
  SELECT oi."productId", SUM(oi."quantity")::int AS qty
  FROM "OrderItem" oi
  JOIN "Order" o ON o."id" = oi."orderId"
  WHERE o."status" = 'PENDING_PAYMENT'
  GROUP BY oi."productId"
) held
WHERE held."productId" = p."id";

UPDATE "Product" SET "imageUrls" = ARRAY["imageUrl"] WHERE "imageUrl" IS NOT NULL;

-- AlterTable: ProductReview
ALTER TABLE "ProductReview" ADD COLUMN     "hiddenAt" TIMESTAMP(3),
ADD COLUMN     "hiddenById" TEXT,
ADD COLUMN     "hiddenReason" TEXT,
ADD COLUMN     "isHidden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "orderItemId" TEXT;

-- AlterTable: Refund (hoàn tiền đơn hàng; người mua là HLV ⇒ không có memberId)
ALTER TABLE "Refund" ADD COLUMN     "orderId" TEXT,
ALTER COLUMN "memberId" DROP NOT NULL;

-- AlterTable: User
ALTER TABLE "User" ADD COLUMN     "checkoutLockedUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Cart" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartItem" (
    "id" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceSnapshot" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAddress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "ward" TEXT,
    "street" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderStatusHistory" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fromStatus" "OrderStatus",
    "toStatus" "OrderStatus" NOT NULL,
    "actorId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryTransaction" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "type" "InventoryTransactionType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "stockAfter" INTEGER NOT NULL,
    "reservedAfter" INTEGER NOT NULL,
    "orderId" TEXT,
    "actorId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryTransaction_pkey" PRIMARY KEY ("id")
);

-- Lịch sử khởi tạo cho đơn cũ + số dư đầu kỳ của nhật ký kho.
INSERT INTO "OrderStatusHistory" ("id", "orderId", "fromStatus", "toStatus", "actorId", "reason", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, o."id", NULL, o."status", NULL, 'Chuyển dữ liệu: trạng thái tại thời điểm nâng cấp cửa hàng', o."updatedAt", o."updatedAt"
FROM "Order" o;

INSERT INTO "InventoryTransaction" ("id", "productId", "type", "quantity", "stockAfter", "reservedAfter", "orderId", "actorId", "note", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, p."id", 'ADJUST', p."stockQuantity", p."stockQuantity", p."reservedStock", NULL, NULL, 'Số dư đầu kỳ khi bật nhật ký kho', NOW(), NOW()
FROM "Product" p;

-- CreateIndex
CREATE UNIQUE INDEX "Cart_userId_key" ON "Cart"("userId");

-- CreateIndex
CREATE INDEX "CartItem_productId_idx" ON "CartItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "CartItem_cartId_productId_key" ON "CartItem"("cartId", "productId");

-- CreateIndex
CREATE INDEX "UserAddress_userId_idx" ON "UserAddress"("userId");

-- CreateIndex
CREATE INDEX "OrderStatusHistory_orderId_createdAt_idx" ON "OrderStatusHistory"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryTransaction_productId_createdAt_idx" ON "InventoryTransaction"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryTransaction_orderId_idx" ON "InventoryTransaction"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_code_key" ON "Order"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Order_pickupCodeHash_key" ON "Order"("pickupCodeHash");

-- CreateIndex
CREATE INDEX "Order_userId_status_idx" ON "Order"("userId", "status");

-- CreateIndex
CREATE INDEX "Order_status_paymentExpiresAt_idx" ON "Order"("status", "paymentExpiresAt");

-- CreateIndex
CREATE INDEX "Order_status_pickupDeadline_idx" ON "Order"("status", "pickupDeadline");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_userId_idempotencyKey_key" ON "Order"("userId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ProductReview_orderItemId_key" ON "ProductReview"("orderItemId");

-- CreateIndex
CREATE INDEX "ProductReview_productId_isHidden_idx" ON "ProductReview"("productId", "isHidden");

-- CreateIndex
CREATE INDEX "ProductReview_userId_idx" ON "ProductReview"("userId");

-- CreateIndex
CREATE INDEX "Refund_orderId_idx" ON "Refund"("orderId");

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAddress" ADD CONSTRAINT "UserAddress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
