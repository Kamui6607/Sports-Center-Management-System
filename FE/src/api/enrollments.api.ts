import { allPages } from "../shared/pagedApi";
import { apiClient } from "./client";
import type {
  ConcurrentClassQuota,
  Enrollment,
  WholeCourseEnrollmentResult,
} from "../types/member";

export interface EnrollmentQuery {
  status?: "BOOKED" | "CANCELLED" | "COMPLETED";
  page?: number;
  limit?: number;
}

export const enrollmentsApi = {
  async bookClass(scheduleId: string): Promise<Enrollment> {
    return apiClient.post<Enrollment>("/enrollments", { scheduleId });
  },

  async enrollWholeCourse(
    classId: string,
    memberId?: string,
  ): Promise<WholeCourseEnrollmentResult> {
    return apiClient.post<WholeCourseEnrollmentResult>("/enrollments/bulk", {
      classId,
      ...(memberId ? { memberId } : {}),
    });
  },

  async getMyEnrollments(
    query: EnrollmentQuery = {},
  ): Promise<{ enrollments: Enrollment[]; pagination?: unknown }> {
    if (!query.page)
      return {
        enrollments: (
          await allPages<Enrollment>("GET /enrollments/my", {
            query: query.status ? { status: query.status } : {},
          })
        ).data,
      };
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

  async transferEnrollment(
    id: string,
    targetScheduleId: string,
  ): Promise<Enrollment> {
    return apiClient.post<Enrollment>(`/enrollments/${id}/transfer`, {
      targetScheduleId,
    });
  },

  async getMyQuota(): Promise<ConcurrentClassQuota> {
    return apiClient.get<ConcurrentClassQuota>("/enrollments/my/quota");
  },
};
