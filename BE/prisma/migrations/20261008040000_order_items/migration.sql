-- ProductOrder (1 đơn = 1 sản phẩm) ⇒ Order + OrderItem (1 đơn = nhiều sản phẩm).
-- Idempotent và GIỮ dữ liệu cũ: mỗi ProductOrder cũ thành 1 Order + 1 OrderItem
-- (unitPrice = totalPrice / quantity, totalAmount = totalPrice).

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProductOrderStatus')
     AND NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrderStatus') THEN
    ALTER TYPE "ProductOrderStatus" RENAME TO "OrderStatus";
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('"ProductOrder"') IS NOT NULL AND to_regclass('"Order"') IS NULL THEN
    ALTER TABLE "ProductOrder" RENAME TO "Order";
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductOrder_pkey') THEN
    ALTER TABLE "Order" RENAME CONSTRAINT "ProductOrder_pkey" TO "Order_pkey";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductOrder_userId_fkey') THEN
    ALTER TABLE "Order" RENAME CONSTRAINT "ProductOrder_userId_fkey" TO "Order_userId_fkey";
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- Chuyển dữ liệu cũ (chỉ khi "Order" còn cột productId/quantity).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = current_schema() AND table_name = 'Order' AND column_name = 'productId') THEN
    INSERT INTO "OrderItem" ("id", "orderId", "productId", "quantity", "unitPrice", "totalAmount", "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text, o."id", o."productId", o."quantity",
           ROUND(o."totalPrice" / GREATEST(o."quantity", 1), 2), o."totalPrice", o."createdAt", o."updatedAt"
    FROM "Order" o
    WHERE NOT EXISTS (SELECT 1 FROM "OrderItem" i WHERE i."orderId" = o."id");

    ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "ProductOrder_productId_fkey";
    ALTER TABLE "Order" DROP COLUMN "productId";
    ALTER TABLE "Order" DROP COLUMN "quantity";
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "OrderItem_orderId_productId_key" ON "OrderItem"("orderId", "productId");
CREATE INDEX IF NOT EXISTS "OrderItem_productId_idx" ON "OrderItem"("productId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderItem_orderId_fkey') THEN
    ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderItem_productId_fkey') THEN
    ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Payment.productOrderId ⇒ Payment.orderId (kèm index / FK / CHECK).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = current_schema() AND table_name = 'Payment' AND column_name = 'productOrderId') THEN
    ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS "Payment_single_target_check";
    ALTER TABLE "Payment" RENAME COLUMN "productOrderId" TO "orderId";
  END IF;
END $$;

ALTER INDEX IF EXISTS "Payment_productOrderId_key" RENAME TO "Payment_orderId_key";

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Payment_productOrderId_fkey') THEN
    ALTER TABLE "Payment" RENAME CONSTRAINT "Payment_productOrderId_fkey" TO "Payment_orderId_fkey";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = current_schema() AND table_name = 'Payment' AND column_name = 'classId')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Payment_single_target_check') THEN
    ALTER TABLE "Payment" ADD CONSTRAINT "Payment_single_target_check" CHECK ("classId" IS NULL OR "orderId" IS NULL);
  END IF;
END $$;
