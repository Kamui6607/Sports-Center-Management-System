export type UserRole = "MEMBER" | "COACH" | "STAFF" | "MANAGER";
export type Gender = "MALE" | "FEMALE" | "OTHER";
export type MemberTier = "FREE" | "MEMBERSHIP" | "PREMIUM";
export type MembershipStatus = "ACTIVE" | "EXPIRED" | "CANCELLED" | "SUSPENDED";
export type TrainingLevel = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
export type ClassType = "REGULAR" | "PREMIUM";
export type AreaType = "POOL" | "INDOOR" | "OUTDOOR";
export type ScheduleStatus = "SCHEDULED" | "CANCELLED" | "COMPLETED";
export type EnrollmentStatus = "BOOKED" | "CANCELLED" | "COMPLETED";
export type PaymentMethod = "CASH" | "BANK_TRANSFER" | "SEPAY";
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
  areaTypes?: AreaType[];
  createdAt: string;
  updatedAt: string;
}

export interface Room {
  id: string;
  name: string;
  capacity: number;
  location?: string | null;
  areaType: AreaType;
  isActive: boolean;
}

export interface CoachInfo {
  id: string;
  coachId?: string;
  isPrimary: boolean;
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
  sportId?: string;
  sport?: Sport;
  sports?: (Sport | { sport: Sport; sportId?: string })[];
  capacity: number;
  classType: ClassType;
  areaType: AreaType;
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
    totalEnrollments?: number;
    BOOKED?: number;
    COMPLETED?: number;
    CANCELLED?: number;
  };
  availableSlots?: number;
  isFull?: boolean;
  canBook?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CoursePlanSlot {
  weekday: number;
  weekdayLabel: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  roomId: string;
  roomName: string;
  sessionCount: number;
  firstSessionStart: string;
  lastSessionStart: string;
  sessionIds: string[];
}

export interface CourseTimeSlot {
  startTime: string;
  endTime: string;
  durationMinutes: number;
}

export interface CoursePlanSession {
  id: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  weekday: number;
  weekdayLabel: string;
  timeLabel: string;
  status: ScheduleStatus;
  room: Room;
  bookedCount: number;
  remainingSlots: number;
  isFull: boolean;
  isBookable: boolean;
  canBook: boolean;
  myEnrollmentId: string | null;
  myEnrollmentStatus: EnrollmentStatus | null;
  conflictWith: {
    classId: string;
    className: string;
    scheduleId: string;
    startTime: string;
    endTime: string;
  } | null;
}

export interface CourseRegistrationBlocker {
  code: string;
  message: string;
  sessionId?: string;
  startTime?: string;
  endTime?: string;
  roomId?: string;
  roomName?: string;
  details?: Record<string, unknown>;
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

export interface ConcurrentClassQuota {
  hasActiveSubscription: boolean;
  tier: MemberTier | null;
  limit: number;
  used: number;
  remaining: number;
  classes: Array<{
    classId: string;
    className: string;
    futureBookedScheduleCount: number;
    scheduleId: string;
    scheduleStartTime: string;
    enrollmentId: string;
  }>;
}

export interface CourseRegistration {
  eligible: boolean;
  blockers: CourseRegistrationBlocker[];
  subscription: {
    tier: MemberTier;
    endDate: string;
    planName: string | null;
  } | null;
  quota: ConcurrentClassQuota | null;
  penalty: {
    id: string;
    blockedUntil: string | null;
    attendanceRate: number;
    sampleSize: number;
  } | null;
  registeredSessions: number;
  remainingSessionsToRegister: number;
  isFullyRegistered: boolean;
}

export interface CoursePlan {
  course: {
    classId: string;
    className: string;
    description: string | null;
    classType: ClassType;
    areaType: AreaType;
    capacity: number;
    sports: Sport[];
    totalSessions: number;
    firstSessionStart: string;
    lastSessionStart: string;
    lastSessionEnd: string;
    weekdays: number[];
    weekdayLabels: string[];
    timeSlots: CourseTimeSlot[];
    rooms: Room[];
    slots: CoursePlanSlot[];
    availability: {
      minRemainingSlots: number;
      fullSessionCount: number;
      isFullyBookable: boolean;
    };
  } | null;
  sessions: CoursePlanSession[];
  registration: CourseRegistration | null;
}

export interface WholeCourseEnrollmentResult {
  classId: string;
  className: string;
  summary: {
    totalSessions: number;
    enrolledNow: number;
    alreadyBooked: number;
    totalRegistered: number;
    firstSessionStart: string;
    lastSessionEnd: string;
  };
  quota: ConcurrentClassQuota;
  sessions: Array<{
    scheduleId: string;
    startTime: string;
    endTime: string;
    roomId: string;
    roomName: string;
    enrollmentId: string;
    status: "BOOKED" | "REACTIVATED" | "ALREADY_BOOKED";
  }>;
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

export type SepayPaymentStatus = "PENDING" | "SUCCESS" | "FAILED";

export interface SepayCheckout {
  paymentId: string;
  orderCode: string;
  amount: number;
  currency?: "VND" | string;
  status: SepayPaymentStatus;
  gateway: "SEPAY" | string;
  expiresAt: string;
  qrUrl: string;
  transferContent: string;
  bank?: {
    id: string;
    accountNumber: string;
    accountHolder: string;
  };
  plan?: Pick<MembershipPlan, "id" | "name" | "tier" | "durationDays">;
  paidAt?: string | null;
  subscriptionId?: string | null;
}

export interface SepayMockConfirmResult {
  sepayId: number;
  orderCode: string;
  paymentId: string;
  processed: boolean;
  status: string;
  paymentStatus: SepayPaymentStatus;
  subscriptionId?: string | null;
  mock: boolean;
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
