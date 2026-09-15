import { Request, Response, NextFunction } from "express";
import * as authService from "./auth.service.js";
import { sendSuccess, sendCreated } from "../../utils/response.js";

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await authService.register(req.body);
    sendCreated(res, user, "Registration successful");
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    sendSuccess(res, result, "Login successful");
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ success: false, message: "refreshToken is required in body" });
      return;
    }
    await authService.logout(refreshToken);
    sendSuccess(res, null, "Logged out successfully");
  } catch (err) {
    next(err);
  }
}

export async function refreshToken(req: Request, res: Response, next: NextFunction) {
  try {
    const { refreshToken } = req.body;
    const result = await authService.refreshAccessToken(refreshToken);
    sendSuccess(res, result, "Token refreshed successfully");
  } catch (err) {
    next(err);
  }
}

export async function getMe(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await authService.getMe(req.user!.id);
    sendSuccess(res, user, "Profile retrieved successfully");
  } catch (err) {
    next(err);
  }
}

export async function updateMe(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await authService.updateMe(req.user!.id, req.body);
    sendSuccess(res, user, "Profile updated successfully");
  } catch (err) {
    next(err);
  }
}

export async function changePassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { currentPassword, newPassword } = req.body;
    await authService.changePassword(req.user!.id, currentPassword, newPassword);
    sendSuccess(res, null, "Password changed successfully");
  } catch (err) {
    next(err);
  }
}
