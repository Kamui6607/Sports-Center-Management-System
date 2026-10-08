import '../../../auth/domain/entities/app_user.dart';
import '../../../catalog/domain/entities/catalog.dart';
import '../../../schedule/domain/entities/session.dart';
import 'course.dart';

/// Học viên trong khóa (góc nhìn HLV).
class StudentSummary {
  const StudentSummary({
    required this.memberProfileId,
    required this.userId,
    required this.fullName,
    this.avatarUrl,
    this.email,
    this.phone,
    this.trainingLevel,
    this.fitnessGoal,
    this.trainingPreference,
    this.attendedCount = 0,
    this.pastSessionCount = 0,
  });

  final String memberProfileId;
  final String userId;
  final String fullName;
  final String? avatarUrl;
  final String? email;
  final String? phone;
  final TrainingLevel? trainingLevel;
  final String? fitnessGoal;
  final String? trainingPreference;
  final int attendedCount;
  final int pastSessionCount;

  double? get attendanceRate => pastSessionCount == 0 ? null : attendedCount / pastSessionCount;
}

/// Chi tiết khóa ở góc nhìn HLV / Quản lý.
class CoachClassDetail {
  const CoachClassDetail({
    required this.course,
    required this.sessions,
    required this.students,
    required this.grossRevenue,
  });

  final CourseClass course;
  final List<ClassSession> sessions;
  final List<StudentSummary> students;

  /// Tổng tiền học viên đã trả (trước chia 85/15).
  final int grossRevenue;
}

/// Một buổi trong bản nháp tạo khóa.
class DraftSession {
  const DraftSession(this.start, this.end);

  final DateTime start;
  final DateTime end;
}

/// Bản nháp khóa học (gộp `CreateClassSchema` + lịch `activity-plan`).
class ClassDraft {
  const ClassDraft({
    required this.name,
    required this.sportIds,
    required this.capacity,
    required this.classType,
    required this.areaType,
    required this.price,
    required this.roomId,
    required this.sessions,
    this.description,
  });

  final String name;
  final String? description;
  final List<String> sportIds;
  final int capacity;
  final ClassType classType;
  final AreaType areaType;
  final int price;
  final String roomId;
  final List<DraftSession> sessions;
}
