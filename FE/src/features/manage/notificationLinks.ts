import type { Notification } from "../../shared/Communication";

/** Trang quản trị liên quan tới một thông báo (theo `metadata` BE gắn kèm); không xác định được ⇒ `undefined`. */
export function managerNotificationLink(n: Notification): string | undefined {
  const m = n.metadata ?? {};
  const id = (k: string) => (typeof m[k] === "string" && m[k] ? (m[k] as string) : "");
  if (id("refundId")) return "/manager/refunds";
  if (id("orderId")) return "/manager/orders";
  if (id("penaltyId")) return "/manager/attendance";
  if (id("membershipId")) return "/manager/memberships";
  if (id("classId")) return `/manager/classes/${encodeURIComponent(id("classId"))}`;
  if (/WITHDRAWAL/.test(n.type ?? "")) return "/manager/withdrawals";
  return undefined;
}
