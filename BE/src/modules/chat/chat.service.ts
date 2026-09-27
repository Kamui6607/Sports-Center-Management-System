import { prisma } from "../../config/prisma.js";
import { createNotification } from "../notifications/notifications.service.js";
import { AppError } from "../../middlewares/errorHandler.js";
import type { UserRole } from "@prisma/client";
import path from "path";
import fs from "fs";
import { CHAT_UPLOAD_DIR } from "../../middlewares/upload.js";

const allowedContacts: Record<string, UserRole[]> = {
  MEMBER: ["COACH"],
  COACH: ["MEMBER", "MANAGER"],
  MANAGER: [ "COACH"],
};

async function assertCanContact(senderId: string, receiverId?: string) {
  if (!receiverId) return;
  if (senderId === receiverId) throw new AppError("Cannot send messages to yourself", 400);
  const [sender, receiver] = await Promise.all([
    prisma.user.findUnique({ where: { id: senderId }, select: { role: true, isActive: true } }),
    prisma.user.findUnique({ where: { id: receiverId }, select: { role: true, isActive: true } }),
  ]);
  if (!sender?.isActive || !receiver?.isActive)
    throw new AppError("Chat user not found or inactive", 404);
  if (!allowedContacts[sender.role]?.includes(receiver.role))
    throw new AppError("You cannot message this user", 403);
}

export const chatService = {
  async createMessage(data: { senderId: string; receiverId?: string; content?: string; fileUrl?: string }) {
    await assertCanContact(data.senderId, data.receiverId);
    const content = data.content?.trim();
    if (!content && !data.fileUrl) throw new AppError("Message content or file is required", 400);
    if (content && content.length > 5000) throw new AppError("Message content is too long", 400);
    const message = await prisma.chatMessage.create({
      data: {
        senderId: data.senderId,
        receiverId: data.receiverId,
        content,
        fileUrl: data.fileUrl,
        isRead: false,
      },
      include: {
        sender: { select: { id: true, fullName: true, role: true } },
        receiver: { select: { id: true, fullName: true, role: true } },
      },
    });

    await chatService.notifyReceiver(message).catch(() => {});

    return message;
  },

  /** Gửi thông báo cho người nhận khi có tin 1-1 (phòng chung không broadcast notification). */
  async notifyReceiver(message: {
    id: string;
    senderId: string;
    receiverId: string | null;
    content: string | null;
    sender?: { fullName: string } | null;
  }) {
    if (!message.receiverId) return;
    const senderName =
      message.sender?.fullName ??
      (
        await prisma.user.findUnique({
          where: { id: message.senderId },
          select: { fullName: true },
        })
      )?.fullName ??
      "Người dùng";
    await createNotification(
      message.receiverId,
      "CHAT_MESSAGE",
      `Tin nhắn mới từ ${senderName}`,
      message.content ?? "[Tệp đính kèm]",
      { metadata: { senderId: message.senderId, messageId: message.id } }
    );
  },

  /**
   * D03 — Tạo message kèm file đính kèm (đã ghi disk + xác thực chữ ký ở controller):
   * metadata `ChatAttachment` (owner/receiver) + message trong CÙNG transaction.
   * `fileUrl` trỏ về endpoint tải CÓ AUTH (`/chat/attachments/:id`) — không còn URL tĩnh công khai.
   */
  async createMessageWithAttachment(data: {
    senderId: string;
    receiverId?: string;
    content?: string;
    file: { storedName: string; mimeType: string; size: number };
    fileUrlFor: (attachmentId: string) => string;
  }) {
    await assertCanContact(data.senderId, data.receiverId);
    const content = data.content?.trim();
    if (content && content.length > 5000) throw new AppError("Message content is too long", 400);

    const result = await prisma.$transaction(async (tx) => {
      const attachment = await tx.chatAttachment.create({
        data: {
          ownerId: data.senderId,
          receiverId: data.receiverId ?? null,
          storedName: data.file.storedName,
          mimeType: data.file.mimeType,
          size: data.file.size,
        },
      });
      const message = await tx.chatMessage.create({
        data: {
          senderId: data.senderId,
          receiverId: data.receiverId,
          content,
          fileUrl: data.fileUrlFor(attachment.id),
          isRead: false,
        },
        include: {
          sender: { select: { id: true, fullName: true, role: true } },
          receiver: { select: { id: true, fullName: true, role: true } },
        },
      });
      await tx.chatAttachment.update({
        where: { id: attachment.id },
        data: { messageId: message.id },
      });
      return { message, attachment };
    });

    await chatService.notifyReceiver(result.message).catch(() => {});
    return result;
  },

  /**
   * D03 — Kiểm tra quyền tải file chat và trả đường dẫn disk an toàn.
   * - Chủ file / người nhận / MANAGER được tải; message PHÒNG CHUNG (receiverId null) ⇒ mọi user
   *   đã đăng nhập được tải (khớp phạm vi đọc phòng chung).
   * - Tên file lấy từ DB và `basename()` ⇒ không thể path traversal.
   */
  async getAuthorizedAttachment(user: { id: string; role: string }, attachmentId: string) {
    const attachment = await prisma.chatAttachment.findUnique({ where: { id: attachmentId } });
    if (!attachment) throw new AppError("Attachment not found", 404);

    const isOwner = user.id === attachment.ownerId;
    const isReceiver = Boolean(attachment.receiverId) && user.id === attachment.receiverId;
    const isPublicRoom = attachment.receiverId === null;
    const isManager = user.role === "MANAGER";
    if (!isOwner && !isReceiver && !isPublicRoom && !isManager) {
      throw new AppError("Forbidden: bạn không có quyền tải tệp này", 403);
    }

    const filePath = path.join(CHAT_UPLOAD_DIR, path.basename(attachment.storedName));
    if (!fs.existsSync(filePath)) {
      throw new AppError("Attachment file not found on storage", 404);
    }
    return { ...attachment, filePath };
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
    // COACH -> MEMBER, MANAGER
    // MANAGER -> STAFF, COACH
    const allowedRoles = allowedContacts[role] ?? [];

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
