import { Response } from "express";

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  errors?: unknown;
  pagination?: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  message = "Success",
  statusCode = 200,
  pagination?: PaginationMeta
): Response {
  const body: ApiResponse<T> = { success: true, message, data };
  if (pagination) body.pagination = pagination;
  return res.status(statusCode).json(body);
}

export function sendCreated<T>(res: Response, data: T, message = "Created"): Response {
  return sendSuccess(res, data, message, 201);
}

export function sendError(
  res: Response,
  message: string,
  statusCode = 500,
  errors?: unknown
): Response {
  const body: ApiResponse = { success: false, message };
  if (errors) body.errors = errors;
  return res.status(statusCode).json(body);
}
