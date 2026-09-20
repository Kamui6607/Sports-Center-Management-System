import { Request, Response, NextFunction } from "express";
import { chatService } from "./chat.service.js";

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
  try {
    const { receiverId, content } = req.body;
    const userId = (req as any).user.id;

    // Handle file upload if any
    let fileUrl = undefined;
    if (req.file) {
      // Create a static path to the file
      fileUrl = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;
    }

    if (!content && !fileUrl) {
      res.status(400).json({ success: false, message: "Message content or file is required" });
      return;
    }

    const message = await chatService.createMessage({
      senderId: userId,
      receiverId,
      content,
      fileUrl,
    });

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
    next(error);
  }
};

export const markAsRead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { targetId } = req.body;
    const userId = (req as any).user.id;

    await chatService.markAsRead(userId, targetId);
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
    const role = (req as any).user.role;
    const contacts = await chatService.getContacts(role);
    res.json({ success: true, data: contacts });
  } catch (error) {
    next(error);
  }
};
