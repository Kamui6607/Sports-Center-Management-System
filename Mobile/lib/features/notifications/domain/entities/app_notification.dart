/// Loại thông báo (`NotificationType` của BE) — nhóm để chọn icon & điều hướng.
enum NotificationType {
  memberRegistered,
  chatMessage,
  upcomingClass,
  scheduleCancelled,
  scheduleUpdated,
  scheduleRoomChanged,
  enrollmentConfirmed,
  enrollmentCancelled,
  trainingPlanAssigned,
  classApproved,
  classRejected,
  newClass,
  withdrawalApproved,
  withdrawalRejected,
  attendanceWarning,
  attendancePenalty,
  attendancePenaltyRevoked,
  paymentSuccess,
  paymentRefunded,

  /// Cửa hàng: đơn hàng đổi trạng thái.
  orderUpdated,
  general,
}

/// Thông báo trong app (`Notification`).
class AppNotification {
  const AppNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.body,
    required this.createdAt,
    this.isRead = false,
    this.reason,
    this.metadata = const {},
  });

  final String id;
  final NotificationType type;
  final String title;
  final String body;
  final String? reason;
  final bool isRead;
  final DateTime createdAt;

  /// VD `{ scheduleId, classId, refundId, orderId, senderId }`.
  final Map<String, String> metadata;
}
