// Bảng khóa học & tập luyện: Class, ClassSchedule, Enrollment, Attendance, QR, phạt, lộ trình, đánh giá HLV.
// Xem ghi chú chung ở `lib/mock/mock_tables.dart`.

import 'dart:typed_data';

import '../../features/attendance/domain/entities/attendance.dart';
import '../../features/catalog/domain/entities/catalog.dart';
import '../../features/classes/domain/entities/course.dart';
import '../../features/makeup/domain/entities/makeup.dart';
import '../../features/schedule/domain/entities/session.dart';

class ClassRow {
  ClassRow({
    required this.id,
    required this.name,
    required this.sportIds,
    required this.price,
    required this.status,
    required this.coachProfileId,
    required this.capacity,
    required this.classType,
    required this.areaType,
    required this.createdAt,
    this.description,
    this.rejectReason,
  });

  final String id;
  String name;
  String? description;
  List<String> sportIds;
  int price;
  ClassStatus status;
  final String coachProfileId;
  int capacity;
  ClassType classType;
  AreaType areaType;
  final DateTime createdAt;
  String? rejectReason;
}

class SessionRow {
  SessionRow({
    required this.id,
    required this.classId,
    required this.roomId,
    required this.start,
    required this.end,
    this.status = ScheduleStatus.scheduled,
    this.makeupForId,
    this.isMakeupSlot = false,
    this.slotCapacity,
  });

  final String id;
  final String classId;
  String roomId;
  DateTime start;
  DateTime end;
  ScheduleStatus status;
  final String? makeupForId;

  /// Buổi bù mở do HLV tạo (không phải buổi chính).
  final bool isMakeupSlot;
  final int? slotCapacity;
  String? cancelReason;
  CancelResolutionMode? resolution;
}

class EnrollmentRow {
  EnrollmentRow({
    required this.id,
    required this.memberProfileId,
    required this.sessionId,
    required this.bookedAt,
    this.status = EnrollmentStatus.booked,
    this.makeupRequestId,
  });

  final String id;
  final String memberProfileId;
  String sessionId;
  EnrollmentStatus status;
  final DateTime bookedAt;
  DateTime? cancelledAt;

  /// Chỗ học bù được xếp theo yêu cầu này.
  final String? makeupRequestId;
}

/// `MakeupRequest` — yêu cầu học bù cho buổi đã báo vắng.
class MakeupRequestRow {
  MakeupRequestRow({
    required this.id,
    required this.memberProfileId,
    required this.missedEnrollmentId,
    required this.missedSessionId,
    required this.paidClassId,
    required this.coachProfileId,
    required this.reason,
    required this.requestedAt,
    required this.expiresAt,
    required this.refundEligible,
  });

  final String id;
  final String memberProfileId;
  final String missedEnrollmentId;
  final String missedSessionId;
  final String paidClassId;
  final String coachProfileId;
  final String reason;
  final DateTime requestedAt;
  final DateTime expiresAt;
  final bool refundEligible;
  MakeupStatus status = MakeupStatus.pending;
  String? targetSessionId;
  String? rejectReason;
}

class AttendanceRow {
  AttendanceRow({
    required this.id,
    required this.sessionId,
    required this.memberProfileId,
    required this.status,
    this.note,
  });

  final String id;
  final String sessionId;
  final String memberProfileId;
  AttendanceStatus status;
  String? note;
}

class QrTicketRow {
  QrTicketRow({required this.sessionId, required this.token, required this.code, required this.expiresAt});

  final String sessionId;
  final String token;
  final String code;
  final DateTime expiresAt;
}

class PenaltyRow {
  PenaltyRow({
    required this.id,
    required this.memberProfileId,
    required this.classId,
    required this.reason,
    required this.attendanceRate,
    required this.releasedCount,
    required this.createdAt,
    this.blockedUntil,
    this.status = PenaltyStatus.applied,
  });

  final String id;
  final String memberProfileId;
  final String classId;
  final String reason;
  final double attendanceRate;
  final int releasedCount;
  final DateTime createdAt;
  DateTime? blockedUntil;
  PenaltyStatus status;
  String? appealReason;
  DateTime? appealedAt;
}

class TrainingPlanRow {
  TrainingPlanRow({
    required this.id,
    required this.memberProfileId,
    required this.coachProfileId,
    required this.name,
    required this.startDate,
    required this.endDate,
    this.description,
  });

  final String id;
  final String memberProfileId;
  final String coachProfileId;
  final String name;
  final String? description;
  final DateTime startDate;
  final DateTime endDate;
}

class TrainingResultRow {
  TrainingResultRow({
    required this.id,
    required this.planId,
    required this.date,
    this.metrics = const {},
    this.coachNote,
  });

  final String id;
  final String planId;
  final DateTime date;
  final Map<String, String> metrics;
  final String? coachNote;
}

class TrainingPlanAttachmentRow {
  TrainingPlanAttachmentRow({
    required this.id,
    required this.planId,
    required this.name,
    required this.mimeType,
    required this.bytes,
    required this.createdAt,
  });

  final String id;
  final String planId;
  final String name;
  final String mimeType;
  final Uint8List bytes;
  final DateTime createdAt;
}

class FeedbackRow {
  FeedbackRow({
    required this.id,
    required this.coachProfileId,
    required this.memberProfileId,
    required this.rating,
    required this.createdAt,
    this.classId,
    this.comment,
    this.isAnonymous = false,
  });

  final String id;
  final String coachProfileId;
  final String memberProfileId;
  String? classId;
  int rating;
  String? comment;
  bool isAnonymous;
  DateTime createdAt;
}
