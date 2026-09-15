import { Request, Response, NextFunction } from "express";
import { sendError } from "../utils/response.js";

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public errors?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  console.error(`[ERROR] ${err.name}: ${err.message}`);

  if (err instanceof AppError) {
    sendError(res, err.message, err.statusCode, err.errors);
    return;
  }

  // Prisma unique constraint violation
  if ((err as any).code === "P2002") {
    const fields = (err as any).meta?.target ?? "field";
    sendError(res, `Duplicate value for: ${fields}`, 409);
    return;
  }

  // Prisma record not found
  if ((err as any).code === "P2025") {
    sendError(res, "Record not found", 404);
    return;
  }

  // Malformed JSON request body (body-parser sets type="entity.parse.failed")
  if ((err as any).type === "entity.parse.failed") {
    sendError(res, "Invalid JSON request body", 400);
    return;
  }

  sendError(res, "Internal server error", 500);
}
