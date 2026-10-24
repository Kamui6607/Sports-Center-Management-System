import { Request, Response, NextFunction } from "express";
import path from "path";
import fs from "fs";
import { chatService } from "./chat.service.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { CHAT_UPLOAD_DIR } from "../../middlewares/upload.js";
import { sniffMimeFromFile } from "../../utils/fileSignature.js";
import { emitToUsers } from "../../utils/realtime.js";

export const getMessages = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { targetId } = req.query;
    // Assuming `req.user` is populated by auth middleware
    const userId = (req as any).user.id;
    
    const messages = await chatService.getMessages(userId, targetId as string);
    res.json({ success: true, data: messages });
  } catch (error) {
    next(error);
  }
};

export const sendMessage = async (req: Request, res: Response, next: NextFunction) => {
  // D03: file đã ghi disk bởi multer TRƯỚC controller — mọi nhánh lỗi phải dọn file để không
  // để lại rác (request bị từ chối, người nhận không hợp lệ, chữ ký sai, DB lỗi...).
  const uploadedPath = req.file ? path.join(CHAT_UPLOAD_DIR, req.file.filename) : null;
  const cleanupUploaded = async () => {
    if (uploadedPath) await fs.promises.unlink(uploadedPath).catch(() => {});
  };

  try {
    const { receiverId, content } = req.body;
    const userId = req.user!.id;

    let message;
    if (req.file) {
      // Kiểm tra chữ ký THẬT (magic bytes) — không tin mimetype/đuôi client khai báo.
      const sniffed = sniffMimeFromFile(uploadedPath!);
      if (!sniffed || sniffed !== req.file.mimetype) {
        await cleanupUploaded();
        throw new AppError(
          "Tệp đính kèm không hợp lệ (chỉ nhận jpeg/png/webp/gif/pdf và đúng định dạng thật).",
          400
        );
      }

      const created = await chatService.createMessageWithAttachment({
        senderId: userId,
        receiverId,
        content,
        file: { storedName: req.file.filename, mimeType: sniffed, size: req.file.size },
        // D03: URL tải CÓ AUTH thay vì link tĩnh công khai (kèm tên file để FE nhận biết loại ảnh).
        fileUrlFor: (attachmentId) =>
          `${req.protocol}://${req.get("host")}/api/v1/chat/attachments/${attachmentId}` +
          `?name=${encodeURIComponent(req.file!.filename)}`,
      });
      message = created.message;
    } else {
      if (!content) {
        res.status(400).json({ success: false, message: "Message content or file is required" });
        return;
      }
      message = await chatService.createMessage({ senderId: userId, receiverId, content });
    }

    try {
      const { getIo } = await import("./chat.socket.js");
      const io = getIo();
      if (receiverId) {
        io.to(receiverId).emit("newMessage", message);
      } else {
        io.emit("newMessage", message);
      }
    } catch (e) {
      console.error("Failed to emit socket event", e);
    }

    res.status(201).json({ success: true, data: message });
  } catch (error) {
    await cleanupUploaded();
    next(error);
  }
};

/**
 * D03 — Tải file chat có xác thực + phân quyền (chủ file / người nhận / MANAGER; phòng chung:
 * mọi user đã đăng nhập). Không còn phục vụ tĩnh công khai nên URL không thể dò/tải nặc danh.
 */
export const downloadAttachment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const attachment = await chatService.getAuthorizedAttachment(
      { id: req.user!.id, role: req.user!.role },
      String(req.params.id)
    );
    res.setHeader("Content-Type", attachment.mimeType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${path.basename(attachment.storedName)}"`
    );
    // Chống browser "đoán" MIME khác với khai báo (XSS qua file giả ảnh).
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.sendFile(path.resolve(attachment.filePath));
  } catch (error) {
    next(error);
  }
};

export const markAsRead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { targetId } = req.body;
    const userId = (req as any).user.id;

    await chatService.markAsRead(userId, targetId);
    // Báo người gửi biết tin đã được đọc (đồng bộ với sự kiện socket `markAsRead`).
    if (targetId) emitToUsers([targetId], "messagesRead", { byUserId: userId, targetId });
    res.json({ success: true, message: "Messages marked as read" });
  } catch (error) {
    next(error);
  }
};

export const getUnreadCount = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user.id;
    const count = await chatService.getUnreadCount(userId);
    res.json({ success: true, data: { unreadCount: count } });
  } catch (error) {
    next(error);
  }
};

export const getConversations = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user.id;
    const conversations = await chatService.getConversations(userId);
    res.json({ success: true, data: conversations });
  } catch (error) {
    next(error);
  }
};

export const getContacts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const contacts = await chatService.getContacts(req.user!);
    res.json({ success: true, data: contacts });
  } catch (error) {
    next(error);
  }
};
