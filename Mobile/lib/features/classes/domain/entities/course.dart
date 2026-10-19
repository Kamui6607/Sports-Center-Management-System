import '../../../auth/domain/entities/app_user.dart';
import '../../../catalog/domain/entities/catalog.dart';

/// Trạng thái duyệt khóa học (`ClassApprovalStatus`). `draft` = bản nháp HLV đang soạn (wizard tự lưu).
enum ClassStatus { draft, pending, approved, rejected, completed }

/// Hạng khóa (`ClassType`).
enum ClassType { regular, premium }

/// Tóm tắt HLV phụ trách (mỗi khóa đúng 1 HLV).
class CoachSummary {
  const CoachSummary({
    required this.coachProfileId,
    required this.userId,
    required this.fullName,
    this.avatarUrl,
    this.specialization,
    this.experienceYears,
    this.ratingAverage = 0,
    this.ratingCount = 0,
  });

  final String coachProfileId;
  final String userId;
  final String fullName;
  final String? avatarUrl;
  final String? specialization;
  final int? experienceYears;
  final double ratingAverage;
  final int ratingCount;
}

/// Khóa học (`Class`) kèm số liệu tổng hợp để hiển thị thẻ/danh sách.
class CourseClass {
  const CourseClass({
    required this.id,
    required this.name,
    required this.sports,
    required this.price,
    required this.status,
    required this.classType,
    required this.areaType,
    required this.capacity,
    required this.coach,
    required this.mainSessionCount,
    required this.completedSessionCount,
    required this.upcomingSessionCount,
    required this.createdAt,
    this.description,
    this.firstSessionStart,
    this.lastSessionEnd,
    this.nextSessionStart,
    this.studentCount = 0,
    this.minRemainingSlots,
    this.rejectReason,
    this.coachRevenue = 0,
    this.goal,
    this.goalTags = const [],
    this.targetLevel,
    this.startDate,
    this.endDate,
    this.goalMatch,
  });

  final String id;
  final String name;
  final String? description;

  /// Mô tả chi tiết mục tiêu khóa học (HLV ghi).
  final String? goal;

  /// Mã mục tiêu khóa (danh mục [kFitnessGoals]).
  final List<String> goalTags;

  /// Trình độ phù hợp (null = mọi trình độ).
  final TrainingLevel? targetLevel;

  /// Ngày khai giảng / kết thúc (BE tự cập nhật khi lịch thay đổi).
  final DateTime? startDate;
  final DateTime? endDate;

  /// Độ phù hợp với mục tiêu của học viên đang xem (null với Guest/HLV).
  final GoalMatch? goalMatch;
  final List<Sport> sports;

  /// Giá trọn khóa (VND).
  final int price;
  final ClassStatus status;
  final ClassType classType;
  final AreaType areaType;

  /// Sức chứa mỗi buổi.
  final int capacity;
  final CoachSummary coach;

  /// Số buổi chính (không tính buổi dạy bù) — dùng tính tiền hoàn 1 buổi.
  final int mainSessionCount;
  final int completedSessionCount;
  final int upcomingSessionCount;
  final DateTime createdAt;
  final DateTime? firstSessionStart;
  final DateTime? lastSessionEnd;
  final DateTime? nextSessionStart;

  /// Số học viên đã mua.
  final int studentCount;

  /// Chỗ trống ít nhất trong các buổi sắp tới (null nếu không còn buổi).
  final int? minRemainingSlots;

  /// Lý do bị từ chối (BE-2).
  final String? rejectReason;

  /// Doanh thu HLV nhận được (85%) — chỉ có ở góc nhìn Coach.
  final int coachRevenue;

  String get sportNames => sports.map((s) => s.name).join(' · ');

  bool get isDraft => status == ClassStatus.draft;

  List<String> get goalLabels => goalTags.map(goalLabel).toList();

  bool get isFull => minRemainingSlots == 0;
}

/// Khung lịch lặp (gom buổi cùng thứ + giờ + phòng) — từ `course-plan` của BE.
class CourseSlot {
  const CourseSlot({
    required this.weekday,
    required this.timeLabel,
    required this.roomName,
    required this.sessionCount,
  });

  final int weekday;
  final String timeLabel;
  final String roomName;
  final int sessionCount;
}

/// Một buổi sắp tới trong lộ trình khóa, kèm tình trạng của người xem.
class PlanSession {
  const PlanSession({
    required this.id,
    required this.startTime,
    required this.endTime,
    required this.room,
    required this.bookedCount,
    required this.capacity,
    this.isMakeup = false,
    this.mine = false,
    this.conflictWith,
    this.originalStartTime,
    this.rescheduleReason,
  });

  final String id;
  final DateTime startTime;
  final DateTime endTime;
  final Room room;
  final int bookedCount;
  final int capacity;
  final bool isMakeup;

  /// Người xem (Member) đã giữ chỗ buổi này.
  final bool mine;

  /// Tên khóa trùng giờ với lịch của người xem.
  final String? conflictWith;

  /// Buổi đã bị HLV dời lịch: giờ ban đầu + lý do.
  final DateTime? originalStartTime;
  final String? rescheduleReason;

  bool get isRescheduled => originalStartTime != null;

  int get remainingSlots => (capacity - bookedCount).clamp(0, capacity);
  bool get isFull => remainingSlots == 0;
}

/// Tình trạng mua khóa của người xem.
enum PurchaseStatus { none, pendingPayment, purchased }

/// Lý do không mua được (trả về từ BE: `code` + `message`).
class PurchaseBlocker {
  const PurchaseBlocker(this.code, this.message);

  final String code;
  final String message;
}

class PurchaseInfo {
  const PurchaseInfo({
    required this.status,
    this.pendingPaymentId,
    this.blockers = const [],
    this.cancelDeadline,
    this.hasPendingRefund = false,
  });

  static const guest = PurchaseInfo(status: PurchaseStatus.none);

  final PurchaseStatus status;
  final String? pendingPaymentId;
  final List<PurchaseBlocker> blockers;

  /// Hạn chót được hủy khóa (khai giảng − 24h).
  final DateTime? cancelDeadline;
  final bool hasPendingRefund;

  bool get canBuy => status == PurchaseStatus.none && blockers.isEmpty;
}

/// Chi tiết khóa học + lộ trình buổi (`GET /classes/:id` + `/course-plan`).
class CourseDetail {
  const CourseDetail({
    required this.course,
    required this.slots,
    required this.sessions,
    required this.purchase,
    this.goalMatch,
    this.pastSessionCount = 0,
  });

  final CourseClass course;

  /// Độ phù hợp với mục tiêu của học viên (null với Guest/HLV).
  final GoalMatch? goalMatch;

  /// Số buổi (chưa hủy) đã diễn ra.
  final int pastSessionCount;
  final List<CourseSlot> slots;

  /// Các buổi `SCHEDULED` chưa diễn ra.
  final List<PlanSession> sessions;
  final PurchaseInfo purchase;
}

/// Giai đoạn của khóa đã mua (tab ở "Khóa học của tôi").
enum MyCoursePhase { ongoing, upcoming, ended }

/// Khóa học Member đã mua.
class MyCourse {
  const MyCourse({
    required this.course,
    required this.phase,
    required this.purchasedAt,
    required this.amountPaid,
    required this.attendedCount,
    required this.bookedCount,
    required this.totalSessions,
    this.nextSessionStart,
    this.cancelDeadline,
    this.refundStatusLabel,
  });

  final CourseClass course;
  final MyCoursePhase phase;
  final DateTime purchasedAt;
  final int amountPaid;
  final int attendedCount;

  /// Số buổi đang giữ chỗ.
  final int bookedCount;
  final int totalSessions;
  final DateTime? nextSessionStart;
  final DateTime? cancelDeadline;

  /// Có yêu cầu hoàn tiền liên quan (VD "Chờ duyệt hoàn tiền").
  final String? refundStatusLabel;
}

/// Bộ lọc khám phá khóa học (`ClassQuerySchema`).
class ClassQuery {
  const ClassQuery({
    this.search = '',
    this.sportId,
    this.classType,
    this.areaType,
    this.goal,
    this.matchMyGoals = false,
    this.page = 1,
  });

  final String search;
  final String? sportId;
  final ClassType? classType;
  final AreaType? areaType;

  /// Lọc theo một mục tiêu (mã [GoalOption.code]).
  final String? goal;

  /// Chỉ khóa khớp mục tiêu của tôi (Member), sắp theo độ phù hợp.
  final bool matchMyGoals;
  final int page;

  int get activeFilterCount =>
      [sportId, classType, areaType, goal].where((e) => e != null).length + (matchMyGoals ? 1 : 0);

  ClassQuery copyWith({String? search, int? page}) => ClassQuery(
    search: search ?? this.search,
    sportId: sportId,
    classType: classType,
    areaType: areaType,
    goal: goal,
    matchMyGoals: matchMyGoals,
    page: page ?? this.page,
  );

  ClassQuery withFilters({
    String? sportId,
    ClassType? classType,
    AreaType? areaType,
    String? goal,
    bool matchMyGoals = false,
  }) => ClassQuery(
    search: search,
    sportId: sportId,
    classType: classType,
    areaType: areaType,
    goal: goal,
    matchMyGoals: matchMyGoals,
  );

  @override
  bool operator ==(Object other) =>
      other is ClassQuery &&
      other.search == search &&
      other.sportId == sportId &&
      other.classType == classType &&
      other.areaType == areaType &&
      other.goal == goal &&
      other.matchMyGoals == matchMyGoals &&
      other.page == page;

  @override
  int get hashCode => Object.hash(search, sportId, classType, areaType, goal, matchMyGoals, page);
}

/// Mức độ phù hợp khóa ↔ mục tiêu học viên (BE `computeGoalMatch`).
enum GoalMatchLevel { high, medium, low, none, unknown }

class GoalMatch {
  const GoalMatch({required this.score, required this.level, required this.matchedGoals, required this.message});

  /// 0–100.
  final int score;
  final GoalMatchLevel level;
  final List<String> matchedGoals;
  final String message;
}

/// Hồ sơ công khai HLV (`GET /coaches/:id/profile`).
class CoachPublicProfile {
  const CoachPublicProfile({
    required this.coachProfileId,
    required this.userId,
    required this.fullName,
    required this.openCourses,
    required this.totalCourses,
    required this.totalStudents,
    required this.completedSessions,
    required this.ratingCount,
    required this.distribution,
    required this.courses,
    required this.reviews,
    this.avatarUrl,
    this.specialization,
    this.experienceYears,
    this.bio,
    this.ratingAverage,
    this.joinedAt,
  });

  final String coachProfileId;
  final String userId;
  final String fullName;
  final String? avatarUrl;
  final String? specialization;
  final int? experienceYears;
  final String? bio;
  final DateTime? joinedAt;
  final int openCourses;
  final int totalCourses;
  final int totalStudents;
  final int completedSessions;
  final double? ratingAverage;
  final int ratingCount;

  /// Số đánh giá theo mức sao 1..5.
  final Map<int, int> distribution;
  final List<CoachCourseItem> courses;
  final List<CoachReviewItem> reviews;
}

class CoachCourseItem {
  const CoachCourseItem({
    required this.id,
    required this.name,
    required this.price,
    required this.goalTags,
    required this.upcomingSessions,
    this.startDate,
    this.endDate,
  });

  final String id;
  final String name;
  final int price;
  final List<String> goalTags;
  final int upcomingSessions;
  final DateTime? startDate;
  final DateTime? endDate;
}

class CoachReviewItem {
  const CoachReviewItem({required this.rating, required this.createdAt, this.comment, this.authorName, this.className});

  final int rating;
  final String? comment;
  final DateTime createdAt;

  /// null = ẩn danh.
  final String? authorName;
  final String? className;
}

/// Trạng thái khóa học của học viên (`GET /enrollments/my/courses`).
enum MemberCourseStatus { pendingPayment, upcoming, ongoing, completed, cancelled, paidNotEnrolled }

/// Một dòng lịch sử khóa học đã mua — thông tin khóa theo SNAPSHOT lúc mua (giá/tên không đổi khi khóa bị sửa).
class MemberCourse {
  const MemberCourse({
    required this.classId,
    required this.status,
    required this.className,
    required this.coachName,
    required this.amountPaid,
    required this.totalSessions,
    required this.completedSessions,
    required this.myBookedSessions,
    required this.canReview,
    required this.canEditReview,
    this.coachProfileId,
    this.coachUserId,
    this.coachAvatarUrl,
    this.goal,
    this.paidAt,
    this.paymentId,
    this.pendingExpiresAt,
    this.startDate,
    this.endDate,
    this.nextSessionStart,
    this.pendingRefundAmount,
    this.myRating,
    this.myReviewComment,
  });

  final String classId;
  final MemberCourseStatus status;
  final String className;
  final String coachName;
  final String? coachProfileId;
  final String? coachUserId;
  final String? coachAvatarUrl;
  final String? goal;
  final int amountPaid;
  final DateTime? paidAt;
  final String? paymentId;

  /// Hạn chuyển khoản (chỉ khi đang chờ thanh toán).
  final DateTime? pendingExpiresAt;
  final DateTime? startDate;
  final DateTime? endDate;
  final DateTime? nextSessionStart;
  final int totalSessions;
  final int completedSessions;
  final int myBookedSessions;
  final int? pendingRefundAmount;

  /// Đã học xong và chưa đánh giá.
  final bool canReview;

  /// Đã đánh giá, còn 1 lần sửa.
  final bool canEditReview;
  final int? myRating;
  final String? myReviewComment;

  bool get isActive => const {
    MemberCourseStatus.pendingPayment,
    MemberCourseStatus.upcoming,
    MemberCourseStatus.ongoing,
  }.contains(status);
}
