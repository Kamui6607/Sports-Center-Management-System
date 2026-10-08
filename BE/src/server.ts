import "dotenv/config";
import app from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./config/prisma.js";
import { sepayConfig } from "./config/sepay.js";

import http from "http";
import { Server } from "socket.io";
import { setupSocket } from "./modules/chat/chat.socket.js";
import {
  flushNotificationOutbox,
  OUTBOX_FLUSH_INTERVAL_MS,
} from "./modules/notifications/outbox.service.js";
import { expireStaleOrders } from "./modules/products/products.service.js";

/** Nhịp quét đơn sản phẩm quá hạn chờ chuyển khoản (ms). */
const PRODUCT_ORDER_EXPIRY_INTERVAL_MS = 60_000;

async function main() {
  // Fail-fast: `SEPAY_MOCK_MODE` chỉ dành cho dev/demo/e2e — bật nhầm ở production là lỗ hổng
  // cho phép member tự xác nhận "đã thu tiền" cho giao dịch của mình.
  if (env.NODE_ENV === "production" && sepayConfig().mockMode) {
    console.error(
      "[FATAL] SEPAY_MOCK_MODE=true trên môi trường production — tắt biến này trước khi chạy server."
    );
    process.exit(1);
  }

  await prisma.$connect();
  console.log("Database connected");

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  setupSocket(io);

  // F01: worker outbox — gửi nốt notification PENDING (retry sau crash/lỗi tạm thời).
  // Các luồng nghiệp vụ đã flush ngay sau commit; worker này là lưới an toàn.
  const outboxTimer = setInterval(() => {
    void flushNotificationOutbox().catch((err: any) =>
      console.warn("[OUTBOX] flush lỗi:", (err as Error).message)
    );
  }, OUTBOX_FLUSH_INTERVAL_MS);
  outboxTimer.unref();

  // Đơn sản phẩm PENDING quá hạn chờ chuyển khoản ⇒ hủy + hoàn kho (giữ hàng không bị treo mãi).
  const productOrderTimer = setInterval(() => {
    void expireStaleOrders().catch((err: any) =>
      console.warn("[PRODUCT ORDER] quét đơn hết hạn lỗi:", (err as Error).message)
    );
  }, PRODUCT_ORDER_EXPIRY_INTERVAL_MS);
  productOrderTimer.unref();

  server.listen(env.PORT, () => {
    console.log(`Server health running at http://localhost:${env.PORT}/api/v1/health`);
    console.log(`Swagger docs at http://localhost:${env.PORT}/api/v1/docs`);
  });
}

main().catch((err: any) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});