export type UserRole = "MEMBER" | "COACH" | "STAFF" | "MANAGER";
export type Gender = "MALE" | "FEMALE" | "OTHER";
export type MemberTier = "FREE" | "MEMBERSHIP" | "PREMIUM";
export type MembershipStatus = "ACTIVE" | "EXPIRED" | "CANCELLED" | "SUSPENDED";
export type TrainingLevel = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
export type ClassType = "REGULAR" | "PREMIUM";
export type ScheduleStatus = "SCHEDULED" | "CANCELLED" | "COMPLETED";
export type EnrollmentStatus = "BOOKED" | "CANCELLED" | "COMPLETED";
export type PaymentMethod = "CASH" | "BANK_TRANSFER";
export type PaymentStatus = "PENDING" | "SUCCESS" | "FAILED" | "REFUNDED";

export interface MemberProfile {
  id: string;
  userId: string;
  fitnessGoal?: string | null;
  trainingLevel?: TrainingLevel | null;
  trainingPreference?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  phone?: string | null;
  gender?: Gender | null;
  dateOfBirth?: string | null;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  memberProfile?: MemberProfile | null;
  coachProfile?: unknown;
  managerProfile?: unknown;
}

export interface Sport {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Room {
  id: string;
  name: string;
  capacity: number;
  location?: string | null;
  isActive: boolean;
}

export interface CoachInfo {
  id: string;
  coach: {
    id: string;
    specialization?: string | null;
    experienceYears?: number | null;
    bio?: string | null;
    user: {
      id: string;
      fullName: string;
      email: string;
    };
  };
}

export interface ClassItem {
  id: string;
  name: string;
  description?: string | null;
  sportId: string;
  sport: Sport;
  capacity: number;
  classType: ClassType;
  isActive: boolean;
  coaches?: CoachInfo[];
  schedules?: ClassSchedule[];
  _count?: {
    enrollments: number;
    schedules: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ClassSchedule {
  id: string;
  classId: string;
  class: ClassItem;
  roomId: string;
  room: Room;
  startTime: string;
  endTime: string;
  status: ScheduleStatus;
  _count?: {
    enrollments: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface Enrollment {
  id: string;
  memberId: string;
  classId: string;
  scheduleId: string;
  status: EnrollmentStatus;
  bookedAt: string;
  cancelledAt?: string | null;
  schedule: ClassSchedule;
  createdAt: string;
  updatedAt: string;
}

export interface MembershipPlan {
  id: string;
  name: string;
  description?: string | null;
  price: string | number;
  durationDays: number;
  tier: MemberTier;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MembershipSubscription {
  id: string;
  memberId: string;
  planId: string;
  plan: MembershipPlan;
  tier: MemberTier;
  startDate: string;
  endDate: string;
  status: MembershipStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  errors?: { field: string; message: string }[];
}
