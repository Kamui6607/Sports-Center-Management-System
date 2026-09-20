import { Server, Socket } from "socket.io";
import { chatService } from "./chat.service.js";

// Store connected users for real-time notifications
const connectedUsers = new Map<string, string>();

let ioInstance: Server | null = null;

export const getIo = () => {
  if (!ioInstance) {
    throw new Error("Socket.io not initialized");
  }
  return ioInstance;
};

export const setupSocket = (io: Server) => {
  ioInstance = io;
  io.on("connection", (socket: Socket) => {
    console.log("User connected to socket:", socket.id);

    // Authentication could be done via middleware or event
    socket.on("join", (userId: string) => {
      connectedUsers.set(userId, socket.id);
      socket.join(userId); // Join a room with their userId
      console.log(`User ${userId} joined with socket ${socket.id}`);
    });

    socket.on("sendMessage", async (data: { senderId: string; receiverId?: string; content?: string; fileUrl?: string }) => {
      try {
        const message = await chatService.createMessage(data);

        // Broadcast to receiver if it's a 1-to-1 message
        if (data.receiverId) {
          io.to(data.receiverId).emit("newMessage", message);
        } else {
          // If no receiver, it's a global chat for all staff/managers
          // Emit to a global room or broadcast
          io.emit("newMessage", message);
        }

        // Also emit to the sender to confirm
        socket.emit("messageSent", message);
      } catch (error) {
        console.error("Socket sendMessage error:", error);
        socket.emit("error", { message: "Failed to send message" });
      }
    });

    socket.on("markAsRead", async (data: { userId: string; targetId?: string }) => {
      try {
        await chatService.markAsRead(data.userId, data.targetId);
        // Acknowledge read success
        socket.emit("messagesRead", { targetId: data.targetId });
      } catch (error) {
        console.error("Socket markAsRead error:", error);
      }
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
      // Remove from connected users (could iterate, but keeping simple)
      for (const [key, value] of connectedUsers.entries()) {
        if (value === socket.id) {
          connectedUsers.delete(key);
          break;
        }
      }
    });
  });
};
