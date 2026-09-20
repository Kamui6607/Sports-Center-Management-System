import { Request, Response, NextFunction } from "express";
import * as notificationsService from "./notifications.service.js";
import { sendSuccess } from "../../utils/response.js";

export async function getMyNotifications(req: Request, res: Response, next: NextFunction) {
  try {
    const { notifications, pagination } = await notificationsService.getMyNotifications(req.user!.id, req.query);
    sendSuccess(res, notifications, "Notifications retrieved", 200, pagination);
  } catch (err) { next(err); }
}

export async function markRead(req: Request, res: Response, next: NextFunction) {
  try {
    const notif = await notificationsService.markNotificationRead(
      req.params.id as string,
      req.user!.id
    );
    sendSuccess(res, notif, "Notification marked as read");
  } catch (err) { next(err); }
}

export async function markAllRead(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await notificationsService.markAllRead(req.user!.id);
    sendSuccess(res, result, "All notifications marked as read");
  } catch (err) { next(err); }
}

export async function getUnreadCount(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await notificationsService.getUnreadCount(req.user!.id);
    sendSuccess(res, result, "Unread count retrieved");
  } catch (err) { next(err); }
}

export async function triggerUpcomingReminders(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await notificationsService.sendUpcomingClassReminders();
    sendSuccess(res, result, "Upcoming class reminders sent");
  } catch (err) { next(err); }
}
