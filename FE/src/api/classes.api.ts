import { apiClient } from "./client";
import type { ClassItem, ClassSchedule, Sport } from "../types/member";

export interface ClassQuery {
  search?: string;
  sportId?: string;
  classType?: "REGULAR" | "PREMIUM";
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
}

export const classesApi = {
  async getClasses(query: ClassQuery = {}): Promise<{ classes: ClassItem[]; pagination?: unknown }> {
    const params = new URLSearchParams();
    if (query.search) params.append("search", query.search);
    if (query.sportId) params.append("sportId", query.sportId);
    if (query.classType) params.append("classType", query.classType);
    if (query.isActive !== undefined) params.append("isActive", String(query.isActive));
    if (query.coachId) params.append("coachId", query.coachId);
    if (query.page) params.append("page", String(query.page));
    if (query.limit) params.append("limit", String(query.limit));

    const qs = params.toString();
    return apiClient.get<{ classes: ClassItem[]; pagination?: unknown }>(
      `/classes${qs ? `?${qs}` : ""}`
    );
  },

  async getClassById(id: string): Promise<ClassItem> {
    return apiClient.get<ClassItem>(`/classes/${id}`);
  },

  async getSports(): Promise<{ sports: Sport[] }> {
    return apiClient.get<{ sports: Sport[] }>("/sports?isActive=true");
  },

  async getSchedules(query: ScheduleQuery = {}): Promise<{ schedules: ClassSchedule[]; pagination?: unknown }> {
    const params = new URLSearchParams();
    if (query.classId) params.append("classId", query.classId);
    if (query.roomId) params.append("roomId", query.roomId);
    if (query.status) params.append("status", query.status);
    if (query.date) params.append("date", query.date);
    if (query.startAfter) params.append("startAfter", query.startAfter);
    if (query.startBefore) params.append("startBefore", query.startBefore);

    const qs = params.toString();
    return apiClient.get<{ schedules: ClassSchedule[]; pagination?: unknown }>(
      `/class-schedules${qs ? `?${qs}` : ""}`
    );
  },

  async getScheduleById(id: string): Promise<ClassSchedule> {
    return apiClient.get<ClassSchedule>(`/class-schedules/${id}`);
  },
};
