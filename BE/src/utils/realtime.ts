import type { Server } from "socket.io";

/**
 * Tham chiếu Socket.IO dùng chung để các service phát sự kiện realtime mà không import module chat
 * (tránh vòng import). `server.ts` gắn qua `setupSocket`; khi chạy test/không có socket ⇒ bỏ qua.
 */
let io: Server | null = null;

export function setRealtimeServer(server: Server): void {
  io = server;
}

/** Phát sự kiện tới phòng riêng của từng user (mỗi socket join room = userId khi kết nối). */
export function emitToUsers(userIds: string[], event: string, payload: unknown): void {
  if (!io || userIds.length === 0) return;
  for (const id of new Set(userIds)) io.to(id).emit(event, payload);
}
