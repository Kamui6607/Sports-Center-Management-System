import swaggerJSDoc from "swagger-jsdoc";

const options: swaggerJSDoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Sports Center Management API",
      version: "1.0.0",
      description:
        "Backend API for Sports Center Management System – Flow 1 (User & Course), Flow 2 (Class & Schedule), Flow 3 (Payment & Report)",
    },
    servers: [
      { url: "http://localhost:8080/api/v1", description: "Development Server" },
      { url: "https://sports-center-management-system.onrender.com/api/v1", description: "Production Server (Render)" }
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      responses: {
        // -- Shared error responses --
        BadRequest: {
          description: "Bad request (validation or malformed body)",
          content: {
            "application/json": {
              schema: {
                type: "object",
                example: {
                  success: false,
                  message: "Validation failed",
                  errors: [{ field: "email", message: "Invalid email address" }],
                },
              },
            },
          },
        },
        Unauthorized: {
          description: "Missing, invalid or expired token",
          content: {
            "application/json": {
              schema: {
                type: "object",
                example: { success: false, message: "Unauthorized: invalid or expired token" },
              },
            },
          },
        },
        Forbidden: {
          description: "Insufficient role permissions",
          content: {
            "application/json": {
              schema: {
                type: "object",
                example: { success: false, message: "Forbidden: insufficient permissions" },
              },
            },
          },
        },
        NotFound: {
          description: "Resource not found",
          content: {
            "application/json": {
              schema: {
                type: "object",
                example: { success: false, message: "Record not found" },
              },
            },
          },
        },
        Conflict: {
          description: "Duplicate value or business conflict",
          content: {
            "application/json": {
              schema: {
                type: "object",
                example: { success: false, message: "Duplicate value for: email" },
              },
            },
          },
        },
        TooManyRequests: {
          description: "Too many attempts (rate limited) — e.g. nhập sai mã điểm danh dự phòng quá nhiều lần",
          content: {
            "application/json": {
              schema: {
                type: "object",
                example: {
                  success: false,
                  message:
                    "Bạn đã nhập sai mã điểm danh quá nhiều lần. Vui lòng thử lại sau hoặc nhờ HLV điểm danh trực tiếp.",
                },
              },
            },
          },
        },
        ServerError: {
          description: "Unexpected internal server error",
          content: {
            "application/json": {
              schema: {
                type: "object",
                example: { success: false, message: "Internal server error" },
              },
            },
          },
        },
        // -- Auth --
        LoginOk: {
          description: "Login successful, returns access + refresh tokens",
          content: {
            "application/json": {
              schema: {
                type: "object",
                example: {
                  success: true,
                  message: "Login successful",
                  data: {
                    accessToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImIzMTFkZ...",
                    refreshToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImIzMTFkZ...",
                  },
                },
              },
            },
          },
        },
        RegisterCreated: {
          description: "Registration successful, returns the created member account",
          content: {
            "application/json": {
              schema: {
                type: "object",
                example: {
                  success: true,
                  message: "Registration successful",
                  data: {
                    id: "b311dfe5-8575-4ed4-9efd-8bc81a149f14",
                    email: "member@example.com",
                    fullName: "John Doe",
                    phone: "0900000001",
                    gender: "MALE",
                    dateOfBirth: "2005-06-27T17:00:00.000Z",
                    role: "MEMBER",
                    isActive: true,
                    memberProfile: {
                      id: "aecd9439-82e2-47da-90a2-2830bbe04dc4",
                      trainingLevel: "BEGINNER",
                    },
                  },
                },
              },
            },
          },
        },
        RefreshOk: {
          description: "New access token issued from a valid refresh token",
          content: {
            "application/json": {
              schema: {
                type: "object",
                example: {
                  success: true,
                  message: "Token refreshed successfully",
                  data: { accessToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImIzMTFkZ..." },
                },
              },
            },
          },
        },
        MessageOk: {
          description: "Simple confirmation (data is null)",
          content: {
            "application/json": {
              schema: {
                type: "object",
                example: { success: true, message: "Logged out successfully", data: null },
              },
            },
          },
        },
        ProfileOk: {
          description: "Current user profile (with role-specific profile)",
          content: {
            "application/json": {
              schema: {
                type: "object",
                example: {
                  success: true,
                  message: "Profile retrieved successfully",
                  data: {
                    id: "b311dfe5-8575-4ed4-9efd-8bc81a149f14",
                    email: "member@example.com",
                    fullName: "John Doe",
                    phone: "0900000001",
                    gender: "MALE",
                    dateOfBirth: "2005-06-27T17:00:00.000Z",
                    role: "MEMBER",
                    isActive: true,
                    createdAt: "2026-09-11T14:20:14.910Z",
                    memberProfile: {
                      id: "aecd9439-82e2-47da-90a2-2830bbe04dc4",
                      fitnessGoal: "Lose weight",
                      trainingLevel: "BEGINNER",
                    },
                    coachProfile: null,
                    managerProfile: null,
                  },
                },
              },
            },
          },
        },
        // -- Users --
        UserListOk: {
          description: "Paginated list of users (compact example)",
          content: {
            "application/json": {
              schema: {
                type: "object",
                example: {
                  success: true,
                  message: "Users retrieved successfully",
                  data: [
                    {
                      id: "b311dfe5-8575-4ed4-9efd-8bc81a149f14",
                      email: "coach1@sportscenter.com",
                      fullName: "Jane Doe",
                      phone: "0900000002",
                      gender: "FEMALE",
                      dateOfBirth: null,
                      role: "COACH",
                      isActive: true,
                      createdAt: "2026-09-11T14:20:14.910Z",
                      memberProfile: null,
                      coachProfile: null,
                      managerProfile: null,
                    },
                  ],
                  pagination: { page: 1, limit: 10, total: 8, totalPages: 1 },
                },
              },
            },
          },
        },
        UserCreated: {
          description: "User created (member/coach/manager gets its profile)",
          content: {
            "application/json": {
              schema: {
                type: "object",
                example: {
                  success: true,
                  message: "User created successfully",
                  data: {
                    id: "b311dfe5-8575-4ed4-9efd-8bc81a149f14",
                    email: "member1@example.com",
                    fullName: "John Doe",
                    phone: "0900000005",
                    gender: "MALE",
                    dateOfBirth: null,
                    role: "MEMBER",
                    isActive: true,
                    createdAt: "2026-09-11T14:20:14.910Z",
                    memberProfile: { id: "aecd9439-82e2-47da-90a2-2830bbe04dc4", trainingLevel: "BEGINNER" },
                    coachProfile: null,
                    managerProfile: null,
                  },
                },
              },
            },
          },
        },
        UserOk: {
          description: "Single user",
          content: {
            "application/json": {
              schema: {
                type: "object",
                example: {
                  success: true,
                  message: "User retrieved successfully",
                  data: {
                    id: "b311dfe5-8575-4ed4-9efd-8bc81a149f14",
                    email: "member1@example.com",
                    fullName: "John Doe",
                    phone: "0900000005",
                    gender: "MALE",
                    dateOfBirth: null,
                    role: "MEMBER",
                    isActive: true,
                    memberProfile: { id: "aecd9439-82e2-47da-90a2-2830bbe04dc4" },
                    coachProfile: null,
                    managerProfile: null,
                  },
                },
              },
            },
          },
        },
        // -- Members & Coaches --
        MemberListOk: {
          description: "Paginated list of members (compact example)",
          content: {
            "application/json": {
              schema: {
                type: "object",
                example: {
                  success: true,
                  message: "Members retrieved successfully",
                  data: [
                    {
                      id: "aecd9439-82e2-47da-90a2-2830bbe04dc4",
                      fitnessGoal: "Lose weight",
                      trainingLevel: "BEGINNER",
                      trainingPreference: "Morning",
                      user: {
                        id: "df714df2-8856-48be-bd41-241a04b9f6ad",
                        email: "member1@example.com",
                        fullName: "John Doe",
                        phone: "0900000005",
                        role: "MEMBER",
                        isActive: true,
                      },
                      coursePurchases: [
                        {
                          status: "ACTIVE",
                          endDate: "2026-10-25T08:00:00.000Z",
                          class: { id: "9f1a2b3c-0000-4000-8000-000000000001", name: "Morning Yoga", price: "500000" },
                        },
                      ],
                    },
                  ],
                  pagination: { page: 1, limit: 10, total: 3, totalPages: 1 },
                },
              },
            },
          },
        },
        MemberOk: {
          description: "Single member with active course purchases",
          content: {
            "application/json": {
              schema: {
                type: "object",
                example: {
                  success: true,
                  message: "Member retrieved successfully",
                  data: {
                    id: "aecd9439-82e2-47da-90a2-2830bbe04dc4",
                    fitnessGoal: "Lose weight",
                    trainingLevel: "BEGINNER",
                    user: {
                      id: "df714df2-8856-48be-bd41-241a04b9f6ad",
                      email: "member1@example.com",
                      fullName: "John Doe",
                      phone: "0900000005",
                      role: "MEMBER",
                      isActive: true,
                    },
                    coursePurchases: [
                      {
                        status: "ACTIVE",
                        class: { name: "Morning Yoga", price: "500000" },
                        coachEarning: "425000",
                      },
                    ],
                  },
                },
              },
            },
          },
        },
        MemberCoursesOk: {
          description:
            "Khoa hoc member dang SO HUU (CoursePurchase ACTIVE con han) + tong chi tieu. " +
            "Thay cho MembershipStatusOk cu (Membership da bi bo). daysRemaining = null khi khoa khong gioi han.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                example: {
                  success: true,
                  message: "Member course status retrieved successfully",
                  data: {
                    memberId: "aecd9439-82e2-47da-90a2-2830bbe04dc4",
                    activeCourseCount: 1,
                    activeCourses: [
                      {
                        purchaseId: "f2f6a2a6-0000-4000-8000-000000000001",
                        classId: "9f1a2b3c-0000-4000-8000-000000000001",
                        className: "Morning Yoga",
                        coachId: "c17a5a11-0000-4000-8000-000000000002",
                        coachName: "Nguyen Van Cuong",
                        price: 500000,
                        startDate: "2026-09-25T08:00:00.000Z",
                        endDate: "2026-10-25T08:00:00.000Z",
                        daysRemaining: 30,
                      },
                    ],
                    totalPurchases: 2,
                    totalSpent: 800000,
                  },
                },
              },
            },
          },
        },
        CoachListOk: {
          description: "Paginated list of coaches (compact example)",
          content: {
            "application/json": {
              schema: {
                type: "object",
                example: {
                  success: true,
                  message: "Coaches retrieved successfully",
                  data: [
                    {
                      id: "b311dfe5-8575-4ed4-9efd-8bc81a149f14",
                      email: "coach1@sportscenter.com",
                      fullName: "Coach One",
                      phone: "0900000003",
                      role: "COACH",
                      isActive: true,
                      coachProfile: { specialization: "Yoga, Pilates", experienceYears: 5 },
                    },
                  ],
                  pagination: { page: 1, limit: 10, total: 2, totalPages: 1 },
                },
              },
            },
          },
        },
        CoachOk: {
          description: "Coach details with assigned classes",
          content: {
            "application/json": {
              schema: {
                type: "object",
                example: {
                  success: true,
                  message: "Coach retrieved successfully",
                  data: {
                    id: "b311dfe5-8575-4ed4-9efd-8bc81a149f14",
                    email: "coach1@sportscenter.com",
                    fullName: "Coach One",
                    phone: "0900000003",
                    role: "COACH",
                    isActive: true,
                    coachProfile: {
                      specialization: "Yoga, Pilates",
                      experienceYears: 5,
                      bio: "Yoga instructor",
                      classes: [
                        {
                          isPrimary: true,
                          class: {
                            id: "class-yoga-001",
                            name: "Morning Yoga",
                            sports: [{ name: "Yoga" }],
                            schedules: [],
                          },
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
        // -- Course Purchases (thay cho Membership Plans & Subscriptions) --
        CoursePurchaseOk: {
          description:
            "Một lượt Member mua khóa học. Hoa hồng KHẤU TRỪ: Member trả đúng `price`; " +
            "nền tảng giữ `commissionAmount` (15%); Coach sở hữu khóa nhận `coachEarning` (85%). " +
            "`endDate = null` nghĩa là khóa không giới hạn thời hạn; `daysRemaining = null` tương ứng.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                example: {
                  success: true,
                  message: "Course purchase retrieved successfully",
                  data: {
                    id: "f2f6a2a6-0000-4000-8000-000000000001",
                    memberId: "aecd9439-82e2-47da-90a2-2830bbe04dc4",
                    classId: "9f1a2b3c-0000-4000-8000-000000000001",
                    coachId: "c17a5a11-0000-4000-8000-000000000002",
                    price: "500000",
                    commissionRate: 0.15,
                    commissionAmount: "75000",
                    coachEarning: "425000",
                    startDate: "2026-09-25T08:00:00.000Z",
                    endDate: "2026-10-25T08:00:00.000Z",
                    status: "ACTIVE",
                    daysRemaining: 30,
                    class: { id: "9f1a2b3c-0000-4000-8000-000000000001", name: "Morning Yoga", price: "500000" },
                    coach: { user: { id: "8d2f0b30-0000-4000-8000-000000000003", fullName: "Nguyễn Văn Cường" } },
                    payments: [{ id: "322da21d-5040-44b8-90cc-cfc9eeff2631", amount: "500000", method: "BANK_TRANSFER", status: "SUCCESS" }],
                  },
                },
              },
            },
          },
        },
        CoursePurchaseListOk: {
          description:
            "Danh sách lượt mua khóa học (phân trang). MANAGER kèm `summary` doanh thu/hoa hồng; " +
            "COACH (`/course-purchases/my-sales`) kèm `summary` thu nhập của mình.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                example: {
                  success: true,
                  message: "Course purchases retrieved successfully",
                  data: {
                    purchases: [
                      {
                        id: "f2f6a2a6-0000-4000-8000-000000000001",
                        price: "500000",
                        commissionAmount: "75000",
                        coachEarning: "425000",
                        status: "ACTIVE",
                        startDate: "2026-09-25T08:00:00.000Z",
                        endDate: "2026-10-25T08:00:00.000Z",
                        daysRemaining: 30,
                        class: { id: "9f1a2b3c-0000-4000-8000-000000000001", name: "Morning Yoga" },
                        coach: { user: { fullName: "Nguyễn Văn Cường" } },
                      },
                    ],
                    summary: {
                      activePurchases: 9,
                      grossRevenue: 4500000,
                      platformCommission: 675000,
                      coachEarnings: 3825000,
                      commissionRate: 0.15,
                    },
                  },
                  pagination: { page: 1, limit: 10, total: 9, totalPages: 1 },
                },
              },
            },
          },
        },
        // -- Sports & Rooms --
        SportListOk: {
          description: "Paginated list of sports (compact example)",
          content: {
            "application/json": {
              schema: {
                type: "object",
                example: {
                  success: true,
                  message: "Sports retrieved successfully",
                  data: [
                    {
                      id: "c3e1ef3e-0000-4000-8000-000000000001",
                      name: "Yoga",
                      description: "Yoga class improves flexibility",
                      areaTypes: ["INDOOR"],
                      isActive: true,
                      _count: { classes: 2 },
                    },
                  ],
                  pagination: { page: 1, limit: 10, total: 3, totalPages: 1 },
                },
              },
            },
          },
        },
        SportCreated: {
          description: "Sport created",
          content: {
            "application/json": {
              schema: {
                type: "object",
                example: {
                  success: true,
                  message: "Sport created successfully",
                  data: { id: "c3e1ef3e-0000-4000-8000-000000000009", name: "Boxing", description: "Boxing classes", areaTypes: ["INDOOR"], isActive: true },
                },
              },
            },
          },
        },
        SportOk: {
          description: "Single sport",
          content: {
            "application/json": {
              schema: {
                type: "object",
                example: {
                  success: true,
                  message: "Sport retrieved successfully",
                  data: { id: "c3e1ef3e-0000-4000-8000-000000000001", name: "Yoga", areaTypes: ["INDOOR"], isActive: true, classes: [] },
                },
              },
            },
          },
        },
        RoomListOk: {
          description: "Paginated list of rooms (compact example)",
          content: {
            "application/json": {
              schema: {
                type: "object",
                example: {
                  success: true,
                  message: "Rooms retrieved successfully",
                  data: [{ id: "c3e1ef3e-0000-4000-8000-000000000101", name: "Yoga Room A", capacity: 20, location: "Floor 1", areaType: "INDOOR", isActive: true }],
                  pagination: { page: 1, limit: 10, total: 2, totalPages: 1 },
                },
              },
            },
          },
        },
        RoomCreated: {
          description: "Room created",
          content: {
            "application/json": {
              schema: {
                type: "object",
                example: {
                  success: true,
                  message: "Room created successfully",
                  data: { id: "c3e1ef3e-0000-4000-8000-000000000103", name: "Boxing Room", capacity: 12, areaType: "INDOOR", isActive: true },
                },
              },
            },
          },
        },
        RoomOk: {
          description: "Single room",
          content: {
            "application/json": {
              schema: {
                type: "object",
                example: {
                  success: true,
                  message: "Room retrieved successfully",
                  data: { id: "c3e1ef3e-0000-4000-8000-000000000101", name: "Yoga Room A", capacity: 20, location: "Floor 1", areaType: "INDOOR", isActive: true },
                },
              },
            },
          },
        },
        // -- Classes --
        ClassListOk: {
          description: "Paginated list of classes (compact example)",
          content: {
            "application/json": {
              schema: {
                type: "object",
                example: {
                  success: true,
                  message: "Classes retrieved successfully",
                  data: [
                    {
                      id: "class-yoga-001",
                      name: "Morning Yoga",
                      description: "Gentle yoga class",
                      sports: [{ name: "Yoga" }],
                      capacity: 15,
                      classType: "REGULAR",
                      areaType: "INDOOR",
                      isActive: true,
                      coaches: [{ isPrimary: true, coach: { user: { fullName: "Coach One" } } }],
                      _count: { enrollments: 3, schedules: 2 },
                    },
                  ],
                  pagination: { page: 1, limit: 10, total: 3, totalPages: 1 },
                },
              },
            },
          },
        },
        ClassCreated: {
          description: "Class created",
          content: {
            "application/json": {
              schema: {
                type: "object",
                example: {
                  success: true,
                  message: "Class created successfully",
                  data: {
                    id: "class-boxing-001",
                    name: "Boxing Basics",
                    sports: [{ name: "Boxing" }],
                    capacity: 12,
                    classType: "REGULAR",
                    areaType: "INDOOR",
                  },
                },
              },
            },
          },
        },
        ClassOk: {
          description: "Single class with coaches and upcoming schedules",
          content: {
            "application/json": {
              schema: {
                type: "object",
                example: {
                  success: true,
                  message: "Class retrieved successfully",
                  data: {
                    id: "class-yoga-001",
                    name: "Morning Yoga",
                    sports: [{ name: "Yoga" }],
                    capacity: 15,
                    classType: "REGULAR",
                    areaType: "INDOOR",
                    isActive: true,
                    coaches: [{ isPrimary: true, coach: { user: { fullName: "Coach One" } } }],
                    schedules: [],
                  },
                },
              },
            },
          },
        },
        // -- Class Schedules --
        ScheduleListOk: {
          description: "Paginated list of schedules (compact example)",
          content: {
            "application/json": {
              schema: {
                type: "object",
                example: {
                  success: true,
                  message: "Schedules retrieved successfully",
                  data: [
                    {
                      id: "sch-yoga-001",
                      startTime: "2026-09-15T07:00:00.000Z",
                      endTime: "2026-09-15T08:00:00.000Z",
                      status: "SCHEDULED",
                      class: { name: "Morning Yoga", areaType: "INDOOR", sports: [{ name: "Yoga" }] },
                      room: { name: "Yoga Room A", areaType: "INDOOR" },
                      _count: { enrollments: 2 },
                    },
                  ],
                  pagination: { page: 1, limit: 10, total: 3, totalPages: 1 },
                },
              },
            },
          },
        },
        ScheduleCreated: {
          description: "Schedule created",
          content: {
            "application/json": {
              schema: {
                type: "object",
                example: {
                  success: true,
                  message: "Schedule created successfully",
                  data: {
                    id: "sch-yoga-001",
                    startTime: "2026-09-15T07:00:00.000Z",
                    endTime: "2026-09-15T08:00:00.000Z",
                    status: "SCHEDULED",
                    class: { name: "Morning Yoga", areaType: "INDOOR" },
                    room: { name: "Yoga Room A", areaType: "INDOOR" },
                  },
                },
              },
            },
          },
        },
        ScheduleOk: {
          description: "Single schedule with class/room and enrolled count",
          content: {
            "application/json": {
              schema: {
                type: "object",
                example: {
                  success: true,
                  message: "Schedule retrieved successfully",
                  data: {
                    id: "sch-yoga-001",
                    startTime: "2026-09-15T07:00:00.000Z",
                    endTime: "2026-09-15T08:00:00.000Z",
                    status: "SCHEDULED",
                    class: { name: "Morning Yoga", areaType: "INDOOR", sports: [{ name: "Yoga" }], coaches: [] },
                    room: { name: "Yoga Room A", areaType: "INDOOR" },
                    _count: { enrollments: 2 },
                  },
                },
              },
            },
          },
        },
        // -- Enrollments --
        EnrollmentCreated: {
          description: "Class booked successfully",
          content: {
            "application/json": {
              schema: {
                type: "object",
                example: {
                  success: true,
                  message: "Class booked successfully",
                  data: {
                    id: "6b6b6b6b-0000-4000-8000-000000000201",
                    status: "BOOKED",
                    bookedAt: "2026-09-12T08:00:00.000Z",
                    schedule: {
                      startTime: "2026-09-15T07:00:00.000Z",
                      endTime: "2026-09-15T08:00:00.000Z",
                      class: { name: "Morning Yoga", sports: [{ name: "Yoga" }] },
                      room: { name: "Yoga Room A" },
                    },
                  },
                },
              },
            },
          },
        },
        EnrollmentListOk: {
          description: "Paginated list of enrollments (compact example)",
          content: {
            "application/json": {
              schema: {
                type: "object",
                example: {
                  success: true,
                  message: "Enrollments retrieved successfully",
                  data: [
                    {
                      id: "6b6b6b6b-0000-4000-8000-000000000201",
                      status: "BOOKED",
                      bookedAt: "2026-09-12T08:00:00.000Z",
                      member: { user: { fullName: "John Doe", email: "member1@example.com" } },
                      schedule: {
                        startTime: "2026-09-15T07:00:00.000Z",
                        class: { name: "Morning Yoga" },
                      },
                    },
                  ],
                  pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
                },
              },
            },
          },
        },
        EnrollmentOk: {
          description: "Single enrollment",
          content: {
            "application/json": {
              schema: {
                type: "object",
                example: {
                  success: true,
                  message: "Enrollment retrieved successfully",
                  data: {
                    id: "6b6b6b6b-0000-4000-8000-000000000201",
                    status: "BOOKED",
                    bookedAt: "2026-09-12T08:00:00.000Z",
                    schedule: {
                      startTime: "2026-09-15T07:00:00.000Z",
                      endTime: "2026-09-15T08:00:00.000Z",
                      class: { name: "Morning Yoga", sports: [{ name: "Yoga" }] },
                      room: { name: "Yoga Room A" },
                    },
                  },
                },
              },
            },
          },
        },
        // -- Payments & Invoices --
        PaymentCreated: {
          description: "Payment recorded (invoice auto-created on SUCCESS)",
          content: {
            "application/json": {
              schema: {
                type: "object",
                example: {
                  success: true,
                  message: "Payment recorded successfully",
                  data: {
                    id: "322da21d-5040-44b8-90cc-cfc9eeff2631",
                    amount: "300000",
                    method: "CASH",
                    status: "SUCCESS",
                    paidAt: "2026-09-12T08:00:00.000Z",
                    member: { user: { fullName: "John Doe" } },
                    invoice: { invoiceNumber: "INV-1789136414987-001" },
                  },
                },
              },
            },
          },
        },
        PaymentListOk: {
          description: "Paginated list of payments (compact example)",
          content: {
            "application/json": {
              schema: {
                type: "object",
                example: {
                  success: true,
                  message: "Payments retrieved successfully",
                  data: [
                    {
                      id: "322da21d-5040-44b8-90cc-cfc9eeff2631",
                      amount: "300000",
                      method: "CASH",
                      status: "SUCCESS",
                      paidAt: "2026-09-12T08:00:00.000Z",
                      member: { user: { fullName: "John Doe", email: "member1@example.com" } },
                      invoice: { invoiceNumber: "INV-1789136414987-001" },
                    },
                  ],
                  pagination: { page: 1, limit: 10, total: 2, totalPages: 1 },
                },
              },
            },
          },
        },
        PaymentOk: {
          description: "Single payment",
          content: {
            "application/json": {
              schema: {
                type: "object",
                example: {
                  success: true,
                  message: "Payment retrieved successfully",
                  data: {
                    id: "322da21d-5040-44b8-90cc-cfc9eeff2631",
                    amount: "300000",
                    method: "CASH",
                    status: "SUCCESS",
                    member: { user: { fullName: "John Doe" } },
                    coursePurchase: { class: { name: "Morning Yoga", price: "500000" }, coachEarning: "425000" },
                    invoice: { invoiceNumber: "INV-1789136414987-001" },
                  },
                },
              },
            },
          },
        },
        InvoiceListOk: {
          description: "Paginated list of invoices (compact example)",
          content: {
            "application/json": {
              schema: {
                type: "object",
                example: {
                  success: true,
                  message: "Invoices retrieved successfully",
                  data: [
                    {
                      id: "6b6b6b6b-0000-4000-8000-000000000301",
                      invoiceNumber: "INV-1789136414987-001",
                      subtotal: "300000",
                      discount: "0",
                      total: "300000",
                      status: "ISSUED",
                      issuedAt: "2026-09-12T08:00:00.000Z",
                      memberName: "John Doe",
                      courseName: "Morning Yoga",
                      member: { user: { fullName: "John Doe" } },
                    },
                  ],
                  pagination: { page: 1, limit: 10, total: 2, totalPages: 1 },
                },
              },
            },
          },
        },
        InvoiceOk: {
          description: "Single invoice",
          content: {
            "application/json": {
              schema: {
                type: "object",
                example: {
                  success: true,
                  message: "Invoice retrieved successfully",
                  data: {
                    id: "6b6b6b6b-0000-4000-8000-000000000301",
                    invoiceNumber: "INV-1789136414987-001",
                    subtotal: "300000",
                    discount: "0",
                    total: "300000",
                    status: "ISSUED",
                    issuedAt: "2026-09-12T08:00:00.000Z",
                    memberName: "John Doe",
                    courseName: "Morning Yoga",
                    member: { user: { fullName: "John Doe", email: "member1@example.com" } },
                    payment: { amount: "300000", method: "CASH", status: "SUCCESS" },
                  },
                },
              },
            },
          },
        },
        // -- Reports --
        RevenueReportOk: {
          description: "Revenue report",
          content: {
            "application/json": {
              schema: {
                type: "object",
                example: {
                  success: true,
                  message: "Revenue report retrieved successfully",
                  data: {
                    totalRevenue: 900000,
                    totalPayments: 2,
                    successPayments: 2,
                    failedPayments: 0,
                    pendingPayments: 0,
                    refundedPayments: 0,
                    revenueByMethod: { CASH: 300000, BANK_TRANSFER: 600000 },
                    recentPayments: [
                      {
                        id: "322da21d-5040-44b8-90cc-cfc9eeff2631",
                        amount: "600000",
                        status: "SUCCESS",
                        member: { user: { fullName: "John Doe" } },
                        invoice: { invoiceNumber: "INV-1789136414987-002" },
                      },
                    ],
                  },
                },
              },
            },
          },
        },
        MemberReportOk: {
          description: "Member report",
          content: {
            "application/json": {
              schema: {
                type: "object",
                example: {
                  success: true,
                  message: "Member report retrieved successfully",
                  data: {
                    totalMembers: 3,
                    newMembers: 1,
                    activeMembers: 2,
                    expiredMembers: 1,
                    activeCoursePurchases: 3,
                    activeCourseRevenue: 1500000,
                  },
                },
              },
            },
          },
        },
        EnrollmentReportOk: {
          description: "Enrollment report",
          content: {
            "application/json": {
              schema: {
                type: "object",
                example: {
                  success: true,
                  message: "Enrollment report retrieved successfully",
                  data: {
                    totalEnrollments: 5,
                    cancelledEnrollments: 1,
                    topClasses: [{ classId: "class-yoga-001", className: "Morning Yoga", count: 3 }],
                    enrollmentsByClassType: { REGULAR: 4, PREMIUM: 1 },
                  },
                },
              },
            },
          },
        },
        CourseRevenueReportOk: {
          description: "Course revenue & commission report (thay cho membership report)",
          content: {
            "application/json": {
              schema: {
                type: "object",
                example: {
                  success: true,
                  message: "Course revenue report retrieved successfully",
                  data: {
                    totalPurchases: 12,
                    newPurchases: 4,
                    activePurchases: 9,
                    expiredPurchases: 2,
                    cancelledPurchases: 1,
                    totalRevenue: 5400000,
                    activeGrossRevenue: 4500000,
                    platformCommission: 675000,
                    coachEarnings: 3825000,
                    topCourses: [{ classId: "class-uuid", className: "Morning Yoga", purchaseCount: 5, revenue: 2500000 }],
                  },
                },
              },
            },
          },
        },
        CoursePurchaseLogListOk: {
          description: "Paginated list of course purchase logs (thay cho subscription logs)",
          content: {
            "application/json": {
              schema: {
                type: "object",
                example: {
                  success: true,
                  message: "Course purchase logs retrieved successfully",
                  data: {
                    data: [
                      {
                        id: "f2f6a2a6-0000-4000-8000-000000000001",
                        action: "Mua khoa hoc",
                        username: "Pham Van An",
                        email: "member1@example.com",
                        className: "Morning Yoga",
                        coachName: "Nguyen Van Cuong",
                        price: 500000,
                        commissionAmount: 75000,
                        coachEarning: 425000,
                        status: "ACTIVE",
                        paymentStatus: "SUCCESS",
                        startDate: "2026-09-25T08:00:00.000Z",
                        endDate: "2026-10-25T08:00:00.000Z",
                        purchasedAt: "2026-09-25T08:00:00.123Z"
                      }
                    ],
                    pagination: {
                      page: 1,
                      limit: 20,
                      total: 1,
                      totalPages: 1
                    }
                  },
                },
              },
            },
          },
        },
        },
    },
    security: [{ BearerAuth: [] }],
    tags: [
      { name: "Auth", description: "Authentication & profile" },
      { name: "Users", description: "User management (Manager)" },
      { name: "Members", description: "Member profiles" },
      { name: "Coaches", description: "Coach profiles" },
      { name: "Course Purchases", description: "Member mua khoa hoc cua Coach (hoa hong nen tang 15%)" },
      { name: "Sports", description: "Sport / discipline management" },
      { name: "Rooms", description: "Room management" },
      { name: "Classes", description: "Class management" },
      { name: "Class Schedules", description: "Schedule management" },
      { name: "Enrollments", description: "Class booking" },
      { name: "Payments", description: "Payment recording" },
      { name: "Invoices", description: "Invoice management" },
      { name: "Reports", description: "Analytics & reports" },
      { name: "Chat", description: "Real-time messaging (Manager, Coach & Member)" },
      { name: "Attendance", description: "Class attendance tracking" },
      { name: "Training", description: "Personalized training plans and results" },
      { name: "Notifications", description: "Manage user notifications" },
      { name: "Feedbacks", description: "Member đánh giá HLV sau buổi học" },
    ],
  },
  apis: ["./src/modules/**/*.routes.ts", "./src/modules/**/*.routes.js"],
};

export const swaggerSpec = swaggerJSDoc(options);
