import { Request, Response, NextFunction } from "express";
import * as usersService from "./users.service.js";
import { sendSuccess, sendCreated } from "../../utils/response.js";

export async function listUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const { users, pagination } = await usersService.listUsers(req.query as any);
    sendSuccess(res, users, "Users retrieved successfully", 200, pagination);
  } catch (err) { next(err); }
}

export async function createUser(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await usersService.createUser(req.body);
    sendCreated(res, user, "User created successfully");
  } catch (err) { next(err); }
}

export async function getUserById(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await usersService.getUserById(req.params.id as string);
    sendSuccess(res, user, "User retrieved successfully");
  } catch (err) { next(err); }
}

export async function updateUser(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await usersService.updateUser(req.params.id as string, req.body);
    sendSuccess(res, user, "User updated successfully");
  } catch (err) { next(err); }
}

export async function deactivateUser(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await usersService.deactivateUser(req.params.id as string, req.user!.id);
    sendSuccess(res, user, "User deactivated successfully");
  } catch (err) { next(err); }
}
