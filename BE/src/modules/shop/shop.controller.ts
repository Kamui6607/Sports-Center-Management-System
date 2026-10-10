import { Request, Response, NextFunction } from "express";
import { publicShopConfig } from "../../config/shop.js";
import { sendCreated, sendSuccess } from "../../utils/response.js";
import * as addresses from "./address.service.js";
import * as cart from "./cart.service.js";
import * as checkout from "./checkout.service.js";
import * as orders from "./orders.service.js";

type Handler = (req: Request, res: Response) => Promise<unknown>;

/** Bọc handler async ⇒ lỗi chuyển cho errorHandler (giống các controller khác). */
const wrap = (fn: Handler) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    await fn(req, res);
  } catch (err) {
    next(err);
  }
};

const id = (req: Request, key = "id") => req.params[key] as string;

export const getConfig = wrap(async (_req, res) => sendSuccess(res, publicShopConfig(), "Shop config"));

// ── Giỏ hàng ─────────────────────────────────────────────────────────────────
export const getCart = wrap(async (req, res) => sendSuccess(res, await cart.getCart(req.user!.id), "Cart retrieved"));
export const addCartItem = wrap(async (req, res) =>
  sendSuccess(res, await cart.addToCart(req.user!.id, req.body.productId, req.body.quantity), "Added to cart")
);
export const updateCartItem = wrap(async (req, res) =>
  sendSuccess(res, await cart.updateCartItem(req.user!.id, id(req, "productId"), req.body.quantity), "Cart updated")
);
export const removeCartItem = wrap(async (req, res) =>
  sendSuccess(res, await cart.removeCartItem(req.user!.id, id(req, "productId")), "Removed from cart")
);
export const clearCart = wrap(async (req, res) => sendSuccess(res, await cart.clearCart(req.user!.id), "Cart cleared"));
export const acceptCartPrices = wrap(async (req, res) =>
  sendSuccess(res, await cart.acceptCartPrices(req.user!.id), "Cart prices refreshed")
);

// ── Sổ địa chỉ ───────────────────────────────────────────────────────────────
export const listAddresses = wrap(async (req, res) => sendSuccess(res, await addresses.listAddresses(req.user!.id), "Addresses"));
export const createAddress = wrap(async (req, res) =>
  sendCreated(res, await addresses.createAddress(req.user!.id, req.body), "Address created")
);
export const updateAddress = wrap(async (req, res) =>
  sendSuccess(res, await addresses.updateAddress(req.user!.id, id(req), req.body), "Address updated")
);
export const deleteAddress = wrap(async (req, res) =>
  sendSuccess(res, await addresses.deleteAddress(req.user!.id, id(req)), "Address deleted")
);
export const setDefaultAddress = wrap(async (req, res) =>
  sendSuccess(res, await addresses.setDefaultAddress(req.user!.id, id(req)), "Default address updated")
);

// ── Checkout ─────────────────────────────────────────────────────────────────
export const previewCheckout = wrap(async (req, res) =>
  sendSuccess(res, await checkout.previewCheckout(req.user!.id, req.body), "Checkout preview")
);
export const createOrder = wrap(async (req, res) => {
  const key = (req.header("Idempotency-Key") ?? req.body.idempotencyKey) as string | undefined;
  const result = await checkout.createOrder(req.user!, req.body, key);
  if (result.replayed) sendSuccess(res, result, "Order already created (idempotent replay)");
  else sendCreated(res, result, "Order created — waiting for SePay transfer");
});

// ── Đơn của tôi ──────────────────────────────────────────────────────────────
export const listMyOrders = wrap(async (req, res) => {
  const { orders: list, counts, pagination } = await orders.listMyOrders(req.user!.id, req.query as Record<string, string>);
  res.status(200).json({ success: true, message: "My orders", data: list, counts, pagination });
});
export const getMyOrder = wrap(async (req, res) => sendSuccess(res, await orders.getMyOrder(req.user!.id, id(req)), "Order detail"));
export const cancelMyOrder = wrap(async (req, res) =>
  sendSuccess(res, await orders.cancelMyOrder(req.user!.id, id(req), req.body?.reason), "Order cancelled")
);
export const requestRefund = wrap(async (req, res) =>
  sendSuccess(res, await orders.requestOrderRefund(req.user!.id, id(req), req.body.reason), "Refund requested")
);
export const confirmReceived = wrap(async (req, res) =>
  sendSuccess(res, await orders.confirmReceived(req.user!.id, id(req)), "Order completed")
);
export const reviewOrderItem = wrap(async (req, res) =>
  sendCreated(res, await orders.reviewOrderItem(req.user!.id, id(req), req.body), "Review added")
);

// ── Manager ──────────────────────────────────────────────────────────────────
export const managerListOrders = wrap(async (req, res) => {
  const { orders: list, pagination } = await orders.listOrdersForManager(req.query as Record<string, string> as any);
  sendSuccess(res, list, "Orders", 200, pagination);
});
export const managerGetOrder = wrap(async (req, res) => sendSuccess(res, await orders.getOrderForManager(id(req)), "Order detail"));
export const managerSummary = wrap(async (_req, res) => sendSuccess(res, await orders.managerSummary(), "Shop summary"));
export const managerTransition = wrap(async (req, res) =>
  sendSuccess(res, await orders.managerTransition(req.user!, id(req), req.body), "Order updated")
);
export const verifyPickup = wrap(async (req, res) => sendSuccess(res, await orders.verifyPickupCode(req.body.code), "Pickup code valid"));
export const confirmPickup = wrap(async (req, res) =>
  sendSuccess(res, await orders.confirmPickup(req.user!, id(req), req.body.code, req.body.phoneLast4), "Order picked up")
);
export const listInventory = wrap(async (req, res) => {
  const { items, lowStockCount, pagination } = await orders.listInventory(req.query as Record<string, string>);
  res.status(200).json({ success: true, message: "Inventory", data: items, lowStockCount, pagination });
});
export const changeInventory = wrap(async (req, res) =>
  sendSuccess(res, await orders.changeInventory(req.user!.id, id(req, "productId"), req.body), "Inventory updated")
);
export const listInventoryTransactions = wrap(async (req, res) => {
  const { transactions, pagination } = await orders.listInventoryTransactions(id(req, "productId"), req.query as Record<string, string>);
  sendSuccess(res, transactions, "Inventory transactions", 200, pagination);
});
export const listReviews = wrap(async (req, res) => {
  const { reviews, pagination } = await orders.listReviewsForManager(req.query as Record<string, string>);
  sendSuccess(res, reviews, "Reviews", 200, pagination);
});
export const setReviewVisibility = wrap(async (req, res) =>
  sendSuccess(res, await orders.setReviewVisibility(req.user!.id, id(req), req.body.isHidden, req.body.reason), "Review updated")
);
