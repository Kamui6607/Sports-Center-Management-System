import { Prisma, type InventoryTransactionType } from "@prisma/client";
import { AppError } from "../../middlewares/errorHandler.js";

type Tx = Prisma.TransactionClient;

export interface InventoryChange {
  productId: string;
  type: InventoryTransactionType;
  /** Số lượng dương; riêng ADJUST là delta có dấu. */
  quantity: number;
  orderId?: string | null;
  actorId?: string | null;
  note?: string | null;
}

type StockRow = { stockQuantity: number; reservedStock: number };

/**
 * Thay đổi tồn kho bằng MỘT câu UPDATE có điều kiện (nguyên tử, không đọc-rồi-ghi) + ghi
 * `InventoryTransaction`. Trả `null` khi điều kiện không thỏa (VD không đủ hàng để giữ) — caller
 * quyết định lỗi trả về. Luôn gọi trong transaction và theo thứ tự `productId` tăng dần khi đổi nhiều
 * sản phẩm (chống deadlock giữa hai đơn).
 *
 * | type    | stock | reserved | điều kiện                         |
 * |---------|-------|----------|-----------------------------------|
 * | IN      | +q    |          |                                   |
 * | RESERVE |       | +q       | isActive AND stock − reserved ≥ q |
 * | RELEASE |       | −q       | (không âm)                        |
 * | SALE    | −q    | −q       | reserved ≥ q AND stock ≥ q        |
 * | RETURN  | +q    |          |                                   |
 * | ADJUST  | +δ    |          | stock + δ ≥ reserved              |
 */
export async function applyInventory(tx: Tx, change: InventoryChange): Promise<StockRow | null> {
  const { productId, type } = change;
  const q = Math.trunc(change.quantity);
  if (type !== "ADJUST" && q <= 0) throw new AppError("Số lượng phải lớn hơn 0.", 400);
  if (type === "ADJUST" && q === 0) throw new AppError("Số lượng điều chỉnh phải khác 0.", 400);

  let rows: StockRow[];
  switch (type) {
    case "IN":
    case "RETURN":
      rows = await tx.$queryRaw<StockRow[]>`
        UPDATE "Product" SET "stockQuantity" = "stockQuantity" + ${q}::int, "updatedAt" = NOW()
        WHERE "id" = ${productId}
        RETURNING "stockQuantity", "reservedStock"`;
      break;
    case "RESERVE":
      rows = await tx.$queryRaw<StockRow[]>`
        UPDATE "Product" SET "reservedStock" = "reservedStock" + ${q}::int, "updatedAt" = NOW()
        WHERE "id" = ${productId} AND "isActive" = true AND "stockQuantity" - "reservedStock" >= ${q}::int
        RETURNING "stockQuantity", "reservedStock"`;
      break;
    case "RELEASE":
      rows = await tx.$queryRaw<StockRow[]>`
        UPDATE "Product" SET "reservedStock" = GREATEST("reservedStock" - ${q}::int, 0), "updatedAt" = NOW()
        WHERE "id" = ${productId}
        RETURNING "stockQuantity", "reservedStock"`;
      break;
    case "SALE":
      rows = await tx.$queryRaw<StockRow[]>`
        UPDATE "Product" SET
          "stockQuantity" = "stockQuantity" - ${q}::int,
          "reservedStock" = GREATEST("reservedStock" - ${q}::int, 0),
          "updatedAt" = NOW()
        WHERE "id" = ${productId} AND "stockQuantity" >= ${q}::int
        RETURNING "stockQuantity", "reservedStock"`;
      break;
    case "ADJUST":
      rows = await tx.$queryRaw<StockRow[]>`
        UPDATE "Product" SET "stockQuantity" = "stockQuantity" + ${q}::int, "updatedAt" = NOW()
        WHERE "id" = ${productId} AND "stockQuantity" + ${q}::int >= "reservedStock"
        RETURNING "stockQuantity", "reservedStock"`;
      break;
  }

  const row = rows[0];
  if (!row) return null;
  await tx.inventoryTransaction.create({
    data: {
      productId,
      type,
      quantity: q,
      stockAfter: row.stockQuantity,
      reservedAfter: row.reservedStock,
      orderId: change.orderId ?? null,
      actorId: change.actorId ?? null,
      note: change.note ?? null,
    },
  });
  return row;
}

/** Áp nhiều thay đổi theo thứ tự productId cố định; dòng nào không thỏa ⇒ ném lỗi (rollback cả transaction). */
export async function applyInventoryAll(
  tx: Tx,
  changes: InventoryChange[],
  onFail: (change: InventoryChange) => Promise<never> | never
): Promise<void> {
  for (const change of [...changes].sort((a, b) => a.productId.localeCompare(b.productId))) {
    const ok = await applyInventory(tx, change);
    if (!ok) await onFail(change);
  }
}

/** Số có thể bán. */
export function availableOf(p: { stockQuantity: number; reservedStock: number }): number {
  return Math.max(0, p.stockQuantity - p.reservedStock);
}
