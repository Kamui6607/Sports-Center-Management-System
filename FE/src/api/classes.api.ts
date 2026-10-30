import { allPages } from "../shared/pagedApi";
import { apiClient } from "./client";
import type {
  AreaType,
  ClassItem,
  ClassSchedule,
  CoursePlan,
  Sport,
} from "../types/member";

export interface ClassQuery {
  search?: string;
  sportId?: string;
  classType?: "REGULAR" | "PREMIUM";
  areaType?: AreaType;
  isActive?: boolean;
  coachId?: string;
  page?: number;
  limit?: number;
}

export interface ScheduleQuery {
  classId?: string;
  roomId?: string;
  status?: "SCHEDULED" | "CANCELLED" | "COMPLETED";
  date?: string;
  startAfter?: string;
  startBefore?: string;
  from?: string;
  to?: string;
  weekdays?: string;
}

export const classesApi = {
  async getClasses(query: ClassQuery = {}): Promise<{
    classes: ClassItem[];
    pagination?: { page: number; totalPages: number; total: number };
  }> {
    const params = new URLSearchParams();
    if (query.search) params.append("search", query.search);
    if (query.sportId) params.append("sportId", query.sportId);
    if (query.classType) params.append("classType", query.classType);
    if (query.areaType) params.append("areaType", query.areaType);
    if (query.isActive !== undefined)
      params.append("isActive", String(query.isActive));
    if (query.coachId) params.append("coachId", query.coachId);
    if (query.page) params.append("page", String(query.page));
    if (query.limit) params.append("limit", String(query.limit));

    const qs = params.toString();
    return apiClient.get<{
      classes: ClassItem[];
      pagination?: { page: number; totalPages: number; total: number };
    }>(`/classes${qs ? `?${qs}` : ""}`);
  },

  async getClassById(id: string): Promise<ClassItem> {
    return apiClient.get<ClassItem>(`/classes/${id}`);
  },

  async getCoursePlan(id: string): Promise<CoursePlan> {
    return apiClient.get<CoursePlan>(`/classes/${id}/course-plan`);
  },

  async getSports(): Promise<{ sports: Sport[] }> {
    return {
      sports: (
        await allPages<Sport>("GET /sports", { query: { isActive: "true" } })
      ).data,
    };
  },

  async getSchedules(query: ScheduleQuery = {}): Promise<{
    schedules: ClassSchedule[];
    pagination?: { page: number; totalPages: number; total: number };
  }> {
    const params = new URLSearchParams();
    if (query.classId) params.append("classId", query.classId);
    if (query.roomId) params.append("roomId", query.roomId);
    if (query.status) params.append("status", query.status);
    if (query.date) params.append("date", query.date);
    if (query.startAfter) params.append("startAfter", query.startAfter);
    if (query.startBefore) params.append("startBefore", query.startBefore);
    if (query.from) params.append("from", query.from);
    if (query.to) params.append("to", query.to);
    if (query.weekdays) params.append("weekdays", query.weekdays);

    return {
      schedules: (
        await allPages<ClassSchedule>("GET /class-schedules", {
          query: Object.fromEntries(params),
        })
      ).data,
    };
  },

  async getScheduleById(id: string): Promise<ClassSchedule> {
    return apiClient.get<ClassSchedule>(`/class-schedules/${id}`);
  },
};
