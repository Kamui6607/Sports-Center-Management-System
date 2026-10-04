import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // DB đặt trên Render (xa máy dev): mỗi query mất vài trăm ms, mặc định 5s của interactive
    // transaction không đủ cho các luồng nhiều bước (ghi nhận thanh toán, chốt SePay, hoàn tiền...).
    // Transaction nào cần lâu hơn vẫn tự truyền { timeout } riêng.
    transactionOptions: { maxWait: 10_000, timeout: 20_000 },
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
