import '../../../catalog/domain/entities/catalog.dart';

/// Trạng thái duyệt khóa học (`ClassApprovalStatus`).
enum ClassStatus { pending, approved, rejected, completed }

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
  });

  final String id;
  final String name;
  final String? description;
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

  /// Lý do bị từ chối (TODO BE-2: BE chưa lưu).
  final String? rejectReason;

  /// Doanh thu HLV nhận được (85%) — chỉ có ở góc nhìn Coach.
  final int coachRevenue;

  String get sportNames => sports.map((s) => s.name).join(' · ');

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
  const CourseDetail({required this.course, required this.slots, required this.sessions, required this.purchase});

  final CourseClass course;
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
  const ClassQuery({this.search = '', this.sportId, this.classType, this.areaType, this.page = 1});

  final String search;
  final String? sportId;
  final ClassType? classType;
  final AreaType? areaType;
  final int page;

  int get activeFilterCount => [sportId, classType, areaType].where((e) => e != null).length;

  ClassQuery copyWith({String? search, int? page}) => ClassQuery(
    search: search ?? this.search,
    sportId: sportId,
    classType: classType,
    areaType: areaType,
    page: page ?? this.page,
  );

  ClassQuery withFilters({String? sportId, ClassType? classType, AreaType? areaType}) =>
      ClassQuery(search: search, sportId: sportId, classType: classType, areaType: areaType);

  @override
  bool operator ==(Object other) =>
      other is ClassQuery &&
      other.search == search &&
      other.sportId == sportId &&
      other.classType == classType &&
      other.areaType == areaType &&
      other.page == page;

  @override
  int get hashCode => Object.hash(search, sportId, classType, areaType, page);
}
