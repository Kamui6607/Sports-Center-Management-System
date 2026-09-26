import { Server, Socket } from "socket.io";
import { prisma } from "../../config/prisma.js";
import { verifyAccessToken } from "../../utils/jwt.js";
import { chatService } from "./chat.service.js";

type SocketUser = { id: string; role: string };
type Ack = (result: { ok: boolean; message?: unknown; error?: string }) => void;
const socketsByUser = new Map<string, Set<string>>();
let ioInstance: Server | null = null;

export const getIo = () => {
  if (!ioInstance) throw new Error("Socket.io not initialized");
  return ioInstance;
};

function tokenFrom(socket: Socket) {
  const authToken = socket.handshake.auth?.token;
  if (typeof authToken === "string" && authToken) return authToken;
  const header = socket.handshake.headers.authorization;
  return header?.startsWith("Bearer ") ? header.slice(7) : "";
}

function announcePresence(io: Server, userId: string, online: boolean) {
  io.emit("presenceChanged", { userId, online });
}

export const setupSocket = (io: Server) => {
  ioInstance = io;
  io.use(async (socket, next) => {
    try {
      const payload = verifyAccessToken(tokenFrom(socket));
      const user = await prisma.user.findUnique({
        where: { id: payload.id },
        select: { id: true, role: true, isActive: true },
      });
      if (!user?.isActive || user.role !== payload.role)
        return next(new Error("Unauthorized"));
      socket.data.user = { id: user.id, role: user.role } satisfies SocketUser;
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const user = socket.data.user as SocketUser;
    const existing = socketsByUser.get(user.id) ?? new Set<string>();
    const wasOffline = existing.size === 0;
    existing.add(socket.id);
    socketsByUser.set(user.id, existing);
    socket.join(user.id);
    if (wasOffline) announcePresence(io, user.id, true);

    socket.on("presence:list", (ack?: (ids: string[]) => void) => {
      ack?.([...socketsByUser.keys()]);
    });

    socket.on(
      "sendMessage",
      async (
        data: { receiverId?: string; content?: string },
        ack?: Ack,
      ) => {
        try {
          const message = await chatService.createMessage({
            senderId: user.id,
            receiverId: data?.receiverId,
            content: data?.content,
          });
          if (data?.receiverId) io.to(data.receiverId).emit("newMessage", message);
          else socket.broadcast.emit("newMessage", message);
          socket.emit("messageSent", message);
          ack?.({ ok: true, message });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to send message";
          ack?.({ ok: false, error: message });
        }
      },
    );

    socket.on(
      "typing",
      (data: { receiverId?: string; isTyping?: boolean }) => {
        const payload = { userId: user.id, isTyping: Boolean(data?.isTyping) };
        if (data?.receiverId) io.to(data.receiverId).emit("typing", payload);
        else socket.broadcast.emit("typing", payload);
      },
    );

    socket.on(
      "markAsRead",
      async (data: { targetId?: string }, ack?: Ack) => {
        try {
          await chatService.markAsRead(user.id, data?.targetId);
          if (data?.targetId)
            io.to(data.targetId).emit("messagesRead", {
              byUserId: user.id,
              targetId: data.targetId,
            });
          ack?.({ ok: true });
        } catch (error) {
          ack?.({
            ok: false,
            error: error instanceof Error ? error.message : "Failed to mark messages as read",
          });
        }
      },
    );

    socket.on("disconnect", () => {
      const active = socketsByUser.get(user.id);
      active?.delete(socket.id);
      if (!active?.size) {
        socketsByUser.delete(user.id);
        announcePresence(io, user.id, false);
      }
    });
  });
};
