import { apiClient } from "./client";
import type { MembershipPlan, MembershipSubscription } from "../types/member";

export const membershipApi = {
  async getPlans(): Promise<{ plans: MembershipPlan[] }> {
    return apiClient.get<{ plans: MembershipPlan[] }>("/membership-plans?isActive=true");
  },

  async getPlanById(id: string): Promise<MembershipPlan> {
    return apiClient.get<MembershipPlan>(`/membership-plans/${id}`);
  },

  async getMySubscriptions(
    memberOrUserId: string,
  ): Promise<{ subscriptions: MembershipSubscription[]; pagination?: unknown }> {
    return apiClient.get<{ subscriptions: MembershipSubscription[]; pagination?: unknown }>(
      `/subscriptions/member/${memberOrUserId}`,
    );
  },
};
