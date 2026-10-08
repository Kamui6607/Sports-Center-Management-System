import '../../../core/theme/status_colors.dart';
import '../../../core/widgets/status_tag.dart';
import '../../attendance/domain/entities/attendance.dart';
import '../domain/entities/session.dart';

/// Nhãn trạng thái buổi học, có tính "Đang diễn ra" / "Chờ hoàn tất".
StatusLabel sessionStatus(ClassSession s, DateTime now) {
  if (s.status == ScheduleStatus.cancelled) return const StatusLabel('Đã hủy', StatusTone.danger);
  if (s.status == ScheduleStatus.completed) return const StatusLabel('Đã hoàn thành', StatusTone.success);
  if (s.isOngoing(now)) return const StatusLabel('Đang diễn ra', StatusTone.brand);
  if (s.hasEnded(now)) return const StatusLabel('Chờ hoàn tất', StatusTone.warning);
  return const StatusLabel('Sắp diễn ra', StatusTone.info);
}

extension EnrollmentStatusLabel on EnrollmentStatus {
  StatusLabel get status => switch (this) {
    EnrollmentStatus.booked => const StatusLabel('Đã giữ chỗ', StatusTone.success),
    EnrollmentStatus.completed => const StatusLabel('Đã học', StatusTone.neutral),
    EnrollmentStatus.cancelled => const StatusLabel('Đã hủy', StatusTone.danger),
  };
}

extension AttendanceStatusLabel on AttendanceStatus {
  StatusLabel get status => switch (this) {
    AttendanceStatus.present => const StatusLabel('Có mặt', StatusTone.success),
    AttendanceStatus.late => const StatusLabel('Đi trễ', StatusTone.warning),
    AttendanceStatus.absent => const StatusLabel('Vắng mặt', StatusTone.danger),
    AttendanceStatus.excused => const StatusLabel('Vắng có phép', StatusTone.info),
  };
}

const notCheckedIn = StatusLabel('Chưa điểm danh', StatusTone.neutral);

extension CancelResolutionLabel on CancelResolutionMode {
  String get label => switch (this) {
    CancelResolutionMode.makeup => 'Dạy bù',
    CancelResolutionMode.refund => 'Hoàn tiền buổi học',
  };
}
