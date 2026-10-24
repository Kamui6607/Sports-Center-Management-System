export function isEffectiveSubscription(
  s: { status: string; startDate: string; endDate: string },
  now = Date.now(),
) {
  return (
    s.status === "ACTIVE" &&
    Date.parse(s.startDate) <= now &&
    Date.parse(s.endDate) >= now
  );
}

export function effectiveSubscription<
  T extends {
    status: string;
    startDate: string;
    endDate: string;
    tier: string;
  },
>(subscriptions: T[], now = Date.now()): T | undefined {
  return subscriptions
    .filter((s) => isEffectiveSubscription(s, now))
    .sort(
      (a, b) =>
        Number(b.tier === "PREMIUM") - Number(a.tier === "PREMIUM") ||
        Date.parse(b.endDate) - Date.parse(a.endDate),
    )[0];
}

export function paymentTransitions(status: string, role: string): string[] {
  if (role !== "MANAGER") return [];
  return status === "PENDING"
    ? ["SUCCESS", "FAILED"]
    : status === "SUCCESS"
      ? ["REFUNDED"]
      : [];
}

export function subscriptionTransitions(
  s: { status: unknown; remainingDays?: unknown },
  role: string,
): string[] {
  if (role !== "MANAGER") return [];
  if (s.status === "ACTIVE") return ["SUSPENDED", "CANCELLED"];
  // Older automatically suspended records have no remainingDays. Resuming them
  // on the current backend would silently expire the entitlement immediately.
  if (s.status === "SUSPENDED")
    return typeof s.remainingDays === "number" && s.remainingDays > 0
      ? ["ACTIVE", "CANCELLED"]
      : ["CANCELLED"];
  return [];
}

export function canCompleteSchedule(
  s: { status?: unknown; endTime?: unknown },
  now = Date.now(),
) {
  return s.status === "SCHEDULED" && Date.parse(String(s.endTime)) <= now;
}

export function terminalSessionError(message: string) {
  return /^Unauthorized: (account is locked|role has changed, please login again|user not found)$/i.test(
    message.trim(),
  );
}

export function downgradeReason(
  current: { tier: unknown; plan?: { durationDays?: unknown } } | undefined,
  plan: { tier: unknown; durationDays: unknown },
) {
  if (!current) return "";
  const rank: Record<string, number> = { FREE: 0, MEMBERSHIP: 1, PREMIUM: 2 };
  if ((rank[String(plan.tier)] ?? 0) < (rank[String(current.tier)] ?? 0))
    return "Không thể mua gói thấp hơn hạng hiện tại.";
  if (
    plan.tier === current.tier &&
    Number(plan.durationDays) < Number(current.plan?.durationDays)
  )
    return "Không thể mua gói ngắn hơn cùng hạng.";
  return "";
}

export function refundEstimate(
  endDate: string,
  amount: number,
  durationDays: number,
  role: "MEMBER" | "MANAGER",
  now = Date.now(),
) {
  const daysLeft = Math.max(
    0,
    Math.ceil((Date.parse(endDate) - now) / 86400000),
  );
  const refundAmount =
    role === "MEMBER"
      ? daysLeft > 15
        ? Math.round(amount * 0.3)
        : 0
      : durationDays > 0
        ? Math.round((amount / durationDays) * daysLeft)
        : 0;
  return { daysLeft, refundAmount };
}
