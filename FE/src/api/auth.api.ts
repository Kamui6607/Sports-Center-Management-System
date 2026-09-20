import { apiClient, clearTokens, getRefreshToken, setTokens } from "./client";
import type { User } from "../types/member";

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  gender?: "MALE" | "FEMALE" | "OTHER";
  dateOfBirth?: string;
}

export interface UpdateProfilePayload {
  fullName?: string;
  phone?: string;
  gender?: "MALE" | "FEMALE" | "OTHER";
  dateOfBirth?: string;
  fitnessGoal?: string;
  trainingLevel?: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  trainingPreference?: string;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export const authApi = {
  async login(credentials: LoginPayload): Promise<{ user: User; accessToken: string }> {
    const data = await apiClient.post<{
      accessToken: string;
      refreshToken: string;
    }>("/auth/login", credentials);

    setTokens(data.accessToken, data.refreshToken);
    const user = await authApi.getMe();
    return { user, accessToken: data.accessToken };
  },

  async register(data: RegisterPayload): Promise<User> {
    return apiClient.post<User>("/auth/register", data);
  },

  async logout(): Promise<void> {
    const refreshToken = getRefreshToken();
    try {
      if (refreshToken) {
        await apiClient.post("/auth/logout", { refreshToken });
      }
    } finally {
      clearTokens();
    }
  },

  async getMe(): Promise<User> {
    return apiClient.get<User>("/auth/me");
  },

  async updateMe(data: UpdateProfilePayload): Promise<User> {
    return apiClient.patch<User>("/auth/me", data);
  },

  async changePassword(data: ChangePasswordPayload): Promise<{ message: string }> {
    return apiClient.patch<{ message: string }>("/auth/me/change-password", data);
  },
};
