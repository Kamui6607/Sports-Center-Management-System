import { prisma } from "../../config/prisma.js";
import { createNotification } from "../notifications/notifications.service.js";

export const chatService = {
  async createMessage(data: { senderId: string; receiverId?: string; content?: string; fileUrl?: string }) {
    const message = await prisma.chatMessage.create({
      data: {
        senderId: data.senderId,
        receiverId: data.receiverId,
        content: data.content,
        fileUrl: data.fileUrl,
        isRead: false,
      },
      include: {
        sender: { select: { id: true, fullName: true, role: true } },
        receiver: { select: { id: true, fullName: true, role: true } },
      },
    });

    // Gửi thông báo cho người nhận (chỉ tin 1-1, không broadcast)
    if (data.receiverId) {
      createNotification(
        data.receiverId,
        "CHAT_MESSAGE",
        `Tin nhắn mới từ ${message.sender.fullName}`,
        data.content ?? "[Tệp đính kèm]",
        { metadata: { senderId: data.senderId, messageId: message.id } }
      ).catch(() => {});
    }

    return message;
  },

  async getMessages(userId: string, targetId?: string) {
    // If targetId is provided, get 1-to-1 chat. Otherwise get general chat where receiverId is null
    if (targetId) {
      return prisma.chatMessage.findMany({
        where: {
          OR: [
            { senderId: userId, receiverId: targetId },
            { senderId: targetId, receiverId: userId },
          ],
        },
        orderBy: { createdAt: "asc" },
        include: {
          sender: { select: { id: true, fullName: true, role: true } },
        },
      });
    }

    return prisma.chatMessage.findMany({
      where: {
        receiverId: null, // Broadcast/General group messages
      },
      orderBy: { createdAt: "asc" },
      include: {
        sender: { select: { id: true, fullName: true, role: true } },
      },
    });
  },

  async markAsRead(userId: string, targetId?: string) {
    if (targetId) {
      // Mark 1-to-1 as read (messages sent by target to user)
      return prisma.chatMessage.updateMany({
        where: { senderId: targetId, receiverId: userId, isRead: false },
        data: { isRead: true },
      });
    }
    // For global chat, there is no single receiver, so maybe we skip or handle differently
    // Or if user opens global chat, we don't have a read status array for each user.
    return { count: 0 };
  },

  async getUnreadCount(userId: string) {
    return prisma.chatMessage.count({
      where: {
        receiverId: userId,
        isRead: false,
      },
    });
  },

  async getConversations(userId: string) {
    // Tìm tất cả những user mà user hiện tại đã từng nhắn tin (gửi hoặc nhận)
    const partners = await prisma.user.findMany({
      where: {
        OR: [
          { sentMessages: { some: { receiverId: userId } } },
          { receivedMessages: { some: { senderId: userId } } },
        ],
      },
      select: {
        id: true,
        fullName: true,
        role: true,
      },
    });

    // Lấy tin nhắn mới nhất và đếm số tin chưa đọc cho từng đối tác
    const conversations = await Promise.all(
      partners.map(async (partner) => {
        const latestMessage = await prisma.chatMessage.findFirst({
          where: {
            OR: [
              { senderId: userId, receiverId: partner.id },
              { senderId: partner.id, receiverId: userId },
            ],
          },
          orderBy: { createdAt: "desc" },
        });

        const unreadCount = await prisma.chatMessage.count({
          where: {
            senderId: partner.id,
            receiverId: userId,
            isRead: false,
          },
        });

        return {
          user: partner,
          latestMessage,
          unreadCount,
        };
      })
    );

    // Sắp xếp các cuộc hội thoại sao cho tin nhắn mới nhất lên đầu
    return conversations.sort((a, b) => {
      const timeA = a.latestMessage?.createdAt.getTime() || 0;
      const timeB = b.latestMessage?.createdAt.getTime() || 0;
      return timeB - timeA;
    });
  },

  async getContacts(role: string) {
    // Logic: 
    // STAFF -> MANAGER, COACH
    // MEMBER -> COACH
    // COACH -> MEMBER, STAFF, MANAGER
    // MANAGER -> STAFF, COACH
    let allowedRoles: any[] = [];
    
    switch (role) {
      case "MEMBER":
        allowedRoles = ["COACH"];
        break;
      case "COACH":
        allowedRoles = ["MEMBER", "STAFF", "MANAGER"];
        break;
      case "STAFF":
        allowedRoles = ["MANAGER", "COACH"];
        break;
      case "MANAGER":
        allowedRoles = ["STAFF", "COACH"];
        break;
      default:
        allowedRoles = [];
    }

    return prisma.user.findMany({
      where: {
        role: { in: allowedRoles },
        isActive: true,
      },
      select: {
        id: true,
        fullName: true,
        role: true,
        email: true,
      },
      orderBy: { fullName: "asc" }
    });
  }
};
