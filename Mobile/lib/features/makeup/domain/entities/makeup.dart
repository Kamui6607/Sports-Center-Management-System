/// Trạng thái yêu cầu học bù (`MakeupRequestStatus`).
enum MakeupStatus { pending, scheduled, rejected, expired, cancelled }

/// Buổi học gắn với yêu cầu học bù (buổi vắng / buổi được xếp).
class MakeupSession {
  const MakeupSession({
    required this.id,
    required this.classId,
    required this.className,
    required this.startTime,
    required this.endTime,
    this.roomName,
    this.isMakeupSlot = false,
  });

  final String id;
  final String classId;
  final String className;
  final DateTime startTime;
  final DateTime endTime;
  final String? roomName;

  /// Buổi bù mở do HLV tạo.
  final bool isMakeupSlot;
}

/// Yêu cầu học bù cho một buổi học viên đã báo vắng (`/makeup-requests`).
class MakeupRequest {
  const MakeupRequest({
    required this.id,
    required this.status,
    required this.reason,
    required this.requestedAt,
    required this.expiresAt,
    required this.memberProfileId,
    required this.memberName,
    required this.paidClassId,
    required this.missedEnrollmentId,
    required this.missed,
    this.memberAvatarUrl,
    this.target,
    this.rejectReason,
    this.refundEligible = false,
    this.refundId,
  });

  final String id;
  final MakeupStatus status;
  final String reason;
  final DateTime requestedAt;
  final DateTime expiresAt;
  final String memberProfileId;
  final String memberName;
  final String? memberAvatarUrl;

  /// Khóa học viên đã trả tiền.
  final String paidClassId;
  final String missedEnrollmentId;
  final MakeupSession missed;
  final MakeupSession? target;
  final String? rejectReason;

  /// Gửi ≥ 24h trước buổi vắng ⇒ bị từ chối / hết hạn được hoàn 80%.
  final bool refundEligible;
  final String? refundId;

  bool get isPending => status == MakeupStatus.pending;
}

/// Buổi có thể xếp học bù (`GET /makeup-requests/:id/options`).
class MakeupOption {
  const MakeupOption({
    required this.session,
    required this.capacity,
    required this.bookedCount,
    required this.canSelect,
    this.isSameClass = true,
    this.isFull = false,
    this.guestSeatsFull = false,
    this.conflictWith,
  });

  final MakeupSession session;
  final int capacity;
  final int bookedCount;
  final bool canSelect;
  final bool isSameClass;
  final bool isFull;

  /// Buổi chính của khóa khác đã đủ chỗ dành cho học viên khóa khác.
  final bool guestSeatsFull;

  /// Tên khóa bị trùng giờ (nếu có).
  final String? conflictWith;

  int get remaining => (capacity - bookedCount).clamp(0, capacity);

  /// Lý do không chọn được (null ⇒ chọn được).
  String? get blockReason => canSelect
      ? null
      : isFull
      ? 'Hết chỗ'
      : guestSeatsFull
      ? 'Đã đủ chỗ cho học viên khóa khác'
      : conflictWith != null
      ? 'Trùng giờ với "$conflictWith"'
      : 'Không chọn được';
}

/// HLV mở buổi bù (`POST /makeup-requests/slots`).
class OpenMakeupSlotInput {
  const OpenMakeupSlotInput({
    required this.classId,
    required this.start,
    required this.end,
    this.roomId,
    this.capacity,
    this.assignRequestIds = const [],
  });

  final String classId;
  final DateTime start;
  final DateTime end;
  final String? roomId;
  final int? capacity;
  final List<String> assignRequestIds;
}

class OpenMakeupSlotResult {
  const OpenMakeupSlotResult({required this.slot, required this.assignedCount, required this.failedCount});

  final MakeupSession slot;
  final int assignedCount;
  final int failedCount;
}
