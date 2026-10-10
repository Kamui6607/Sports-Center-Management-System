import { Request, Response, NextFunction } from "express";
import * as productsService from "./products.service.js";
import { sendSuccess, sendCreated } from "../../utils/response.js";

export async function createProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const product = await productsService.createProduct(req.body, req.user!.id);
    sendCreated(res, product, "Product created successfully");
  } catch (err) {
    next(err);
  }
}

export async function listProducts(req: Request, res: Response, next: NextFunction) {
  try {
    const { products, pagination } = await productsService.listProducts(req.query);
    sendSuccess(res, products, "Products retrieved successfully", 200, pagination);
  } catch (err) {
    next(err);
  }
}

export async function getProductById(req: Request, res: Response, next: NextFunction) {
  try {
    const product = await productsService.getProductById(req.params.id as string, req.user);
    sendSuccess(res, product, "Product retrieved successfully");
  } catch (err) {
    next(err);
  }
}

export async function updateProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const product = await productsService.updateProduct(req.params.id as string, req.body, req.user?.id);
    sendSuccess(res, product, "Product updated successfully");
  } catch (err) {
    next(err);
  }
}

export async function deleteProduct(req: Request, res: Response, next: NextFunction) {
  try {
    await productsService.deleteProduct(req.params.id as string);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

// ── Mua và Đánh giá ──────────────────────────────────────────────────────────

export async function createOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const checkout = await productsService.createLegacyOrder(req.user!, req.body.items, req.header("Idempotency-Key") ?? undefined);
    sendCreated(res, checkout, "Order created — waiting for SePay transfer");
  } catch (err) {
    next(err);
  }
}

export async function cancelOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const order = await productsService.cancelOrder(req.params.id as string, req.user!);
    sendSuccess(res, order, "Order cancelled");
  } catch (err) {
    next(err);
  }
}

export async function listMyOrders(req: Request, res: Response, next: NextFunction) {
  try {
    const { orders, pagination } = await productsService.listMyOrders(req.user!.id, req.query);
    sendSuccess(res, orders, "My orders retrieved successfully", 200, pagination);
  } catch (err) {
    next(err);
  }
}

export async function addProductReview(req: Request, res: Response, next: NextFunction) {
  try {
    const review = await productsService.addProductReview(req.user!.id, req.params.id as string, req.body);
    sendCreated(res, review, "Review added successfully");
  } catch (err) {
    next(err);
  }
}
