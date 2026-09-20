export interface Resource {
  slug: string;
  title: string;
  subtitle: string;
  path: string;
  create?: string;
  role?: string;
  columns: [string, string][];
}
export const resources: Resource[] = [
  {
    slug: "users",
    title: "Người dùng",
    subtitle: "Kết nối con người. Xây dựng cộng đồng.",
    path: "/users",
    columns: [
      ["fullName", "Họ và tên"],
      ["email", "Email"],
      ["role", "Vai trò"],
      ["isActive", "Trạng thái"],
    ],
  },
  {
    slug: "members",
    title: "Hội viên",
    subtitle: "Đồng hành trên từng hành trình tập luyện.",
    path: "/members",
    create: "/users",
    role: "MEMBER",
    columns: [
      ["user.fullName", "Hội viên"],
      ["user.email", "Email"],
      ["trainingLevel", "Trình độ"],
      ["fitnessGoal", "Mục tiêu"],
    ],
  },
  {
    slug: "coaches",
    title: "Huấn luyện viên",
    subtitle: "Đội ngũ truyền cảm hứng mỗi ngày.",
    path: "/coaches",
    create: "/users",
    role: "COACH",
    columns: [
      ["fullName", "Huấn luyện viên"],
      ["email", "Email"],
      ["coachProfile.specialization", "Chuyên môn"],
      ["coachProfile.experienceYears", "Kinh nghiệm"],
    ],
  },
  {
    slug: "staff",
    title: "Đội ngũ lễ tân",
    subtitle: "Chăm sóc từng trải nghiệm tại trung tâm.",
    path: "/users",
    role: "STAFF",
    columns: [
      ["fullName", "Họ và tên"],
      ["email", "Email"],
      ["phone", "Điện thoại"],
      ["isActive", "Trạng thái"],
    ],
  },
  {
    slug: "membership-plans",
    title: "Gói thành viên",
    subtitle: "Lựa chọn linh hoạt. Giá trị bền vững.",
    path: "/membership-plans",
    columns: [
      ["name", "Tên gói"],
      ["tier", "Hạng"],
      ["price", "Giá gói"],
      ["durationDays", "Số ngày"],
      ["isActive", "Trạng thái"],
    ],
  },
  {
    slug: "sports",
    title: "Bộ môn",
    subtitle: "Mở rộng đam mê, nâng tầm chuyển động.",
    path: "/sports",
    columns: [
      ["name", "Bộ môn"],
      ["description", "Mô tả"],
      ["_count.classes", "Số lớp"],
      ["isActive", "Trạng thái"],
    ],
  },
  {
    slug: "rooms",
    title: "Phòng tập",
    subtitle: "Không gian sẵn sàng cho mọi mục tiêu.",
    path: "/rooms",
    columns: [
      ["name", "Phòng tập"],
      ["location", "Vị trí"],
      ["capacity", "Sức chứa"],
      ["isActive", "Trạng thái"],
    ],
  },
  {
    slug: "classes",
    title: "Lớp học",
    subtitle: "Mỗi lớp học là một khởi đầu mới.",
    path: "/classes",
    columns: [
      ["name", "Lớp học"],
      ["sport.name", "Bộ môn"],
      ["classType", "Loại lớp"],
      ["capacity", "Sức chứa"],
      ["isActive", "Trạng thái"],
    ],
  },
  {
    slug: "schedules",
    title: "Lịch hoạt động",
    subtitle: "Một nhịp vận hành, mọi thứ trong tầm tay.",
    path: "/class-schedules",
    columns: [
      ["class.name", "Lớp học"],
      ["room.name", "Phòng tập"],
      ["startTime", "Bắt đầu"],
      ["endTime", "Kết thúc"],
      ["status", "Trạng thái"],
    ],
  },
];
