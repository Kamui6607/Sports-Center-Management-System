import { allPages } from "../shared/pagedApi";
import { apiClient } from "./client";
import type { MembershipPlan, MembershipSubscription } from "../types/member";

export const membershipApi = {
  async getPlans(): Promise<{ plans: MembershipPlan[] }> {
    return {
      plans: (
        await allPages<MembershipPlan>("GET /membership-plans", {
          query: { isActive: "true" },
        })
      ).data,
    };
  },

  async getPlanById(id: string): Promise<MembershipPlan> {
    return apiClient.get<MembershipPlan>(`/membership-plans/${id}`);
  },

  async getMySubscriptions(
    memberOrUserId: string,
  ): Promise<{
    subscriptions: MembershipSubscription[];
    pagination?: unknown;
  }> {
    return {
      subscriptions: (
        await allPages<MembershipSubscription>(
          "GET /subscriptions/member/{memberId}",
          { params: { memberId: memberOrUserId } },
        )
      ).data,
    };
  },
};
