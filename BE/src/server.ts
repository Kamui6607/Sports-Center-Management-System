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
import { runShopMaintenance } from "./modules/shop/orders.service.js";
import { runTermMaintenance } from "./modules/terms/term-notifications.js";
import { COACH_TERM } from "./config/coach-term.js";
import { runClassMaintenance } from "./modules/classes/class-maintenance.service.js";
import { runMembershipMaintenance } from "./modules/memberships/memberships.service.js";
import { COURSE_SALE } from "./config/course-sale.js";

/** Nhịp job cửa hàng: đơn hết hạn thanh toán, quá hạn nhận tại quầy, tự hoàn tất (ms). */
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

  // Cửa hàng (Doc/SHOP_FLOW_DESIGN.md): đơn hết hạn ⇒ EXPIRED + nhả hàng; quá hạn nhận ⇒ NOT_PICKED_UP + hoàn tiền;
  // DELIVERED lâu ⇒ COMPLETED. Idempotent, an toàn khi nhiều instance cùng chạy.
  const productOrderTimer = setInterval(() => {
    void runShopMaintenance().catch((err: any) =>
      console.warn("[SHOP] job cửa hàng lỗi:", (err as Error).message)
    );
  }, PRODUCT_ORDER_EXPIRY_INTERVAL_MS);
  productOrderTimer.unref();

  // Kỳ học của Coach (Doc/COACH_TERMS.md): đánh giá + nhắc + báo cáo Manager. Idempotent (CAS theo bậc nhắc) nên an toàn khi
  // chạy lặp / nhiều instance. Timer chỉ chạy khi process đang thức — Manager vẫn gọi tay được qua POST /terms/maintenance.
  const termJob = () =>
    void runTermMaintenance().catch((err: any) => console.warn("[TERMS] job kỳ học lỗi:", (err as Error).message));
  const termTimer = setInterval(termJob, COACH_TERM.MAINTENANCE_INTERVAL_MS);
  termTimer.unref();
  setTimeout(termJob, 30_000).unref();

  // Khóa học (Doc/BUSINESS_HARDENING_PLAN.md §1.2): quá hạn duyệt, báo HLV khóa chưa có học viên, tự đóng khóa
  // qua hạn mở bán mà 0 học viên, đánh dấu khóa đã kết thúc. Idempotent (CAS theo status/alertStage).
  // Gói thành viên (Doc/MEMBERSHIP_FLOW.md §2.5): hết hạn + nhắc gia hạn 7 ngày / 1 ngày — chạy cùng nhịp.
  const classJob = () => {
    void runClassMaintenance().catch((err: any) => console.warn("[CLASSES] job khóa học lỗi:", (err as Error).message));
    void runMembershipMaintenance().catch((err: any) => console.warn("[MEMBERSHIP] job gói thành viên lỗi:", (err as Error).message));
  };
  const classTimer = setInterval(classJob, COURSE_SALE.MAINTENANCE_INTERVAL_MS);
  classTimer.unref();
  setTimeout(classJob, 20_000).unref();

  server.listen(env.PORT, () => {
    console.log(`Server health running at http://localhost:${env.PORT}/api/v1/health`);
    console.log(`Swagger docs at http://localhost:${env.PORT}/api/v1/docs`);
  });
}

main().catch((err: any) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});