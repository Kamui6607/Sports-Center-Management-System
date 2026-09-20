import { apiClient } from "./client";
import type { Enrollment } from "../types/member";

export interface EnrollmentQuery {
  status?: "BOOKED" | "CANCELLED" | "COMPLETED";
  page?: number;
  limit?: number;
}

export const enrollmentsApi = {
  async bookClass(scheduleId: string): Promise<Enrollment> {
    return apiClient.post<Enrollment>("/enrollments", { scheduleId });
  },

  async getMyEnrollments(
    query: EnrollmentQuery = {},
  ): Promise<{ enrollments: Enrollment[]; pagination?: unknown }> {
    const params = new URLSearchParams();
    if (query.status) params.append("status", query.status);
    if (query.page) params.append("page", String(query.page));
    if (query.limit) params.append("limit", String(query.limit));

    const qs = params.toString();
    return apiClient.get<{ enrollments: Enrollment[]; pagination?: unknown }>(
      `/enrollments/my${qs ? `?${qs}` : ""}`,
    );
  },

  async cancelEnrollment(id: string): Promise<Enrollment> {
    return apiClient.delete<Enrollment>(`/enrollments/${id}`);
  },
};
