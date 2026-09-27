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
import {
  LIFECYCLE_INTERVAL_MS,
  runSubscriptionLifecycleJobs,
} from "./modules/subscriptions/subscription-lifecycle.service.js";

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
    void flushNotificationOutbox().catch((err) =>
      console.warn("[OUTBOX] flush lỗi:", (err as Error).message)
    );
  }, OUTBOX_FLUSH_INTERVAL_MS);
  outboxTimer.unref();

  // B07: job vòng đời gói tập — hết hạn (stored-state), nhắc sắp hết hạn, đóng SePay PENDING quá TTL.
  // Chạy ngay sau boot (đồng bộ dữ liệu cũ) rồi lặp 15 phút; lỗi job không làm chết server.
  void runSubscriptionLifecycleJobs().catch((err) =>
    console.warn("[LIFECYCLE] lỗi lượt đầu:", (err as Error).message)
  );
  const lifecycleTimer = setInterval(() => {
    void runSubscriptionLifecycleJobs().catch((err) =>
      console.warn("[LIFECYCLE] lỗi:", (err as Error).message)
    );
  }, LIFECYCLE_INTERVAL_MS);
  lifecycleTimer.unref();

  server.listen(env.PORT, () => {
    console.log(`Server health running at http://localhost:${env.PORT}/api/v1/health`);
    console.log(`Swagger docs at http://localhost:${env.PORT}/api/v1/docs`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});