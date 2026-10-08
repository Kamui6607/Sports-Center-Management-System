import '../../../core/theme/status_colors.dart';
import '../../../core/widgets/status_tag.dart';
import '../domain/entities/refund.dart';

extension RefundStatusLabel on RefundStatus {
  StatusLabel get status => switch (this) {
    RefundStatus.pending => const StatusLabel('Chờ duyệt', StatusTone.warning),
    RefundStatus.completed => const StatusLabel('Đã hoàn tiền', StatusTone.success),
    RefundStatus.rejected => const StatusLabel('Bị từ chối', StatusTone.danger),
  };
}

extension RefundReasonLabel on RefundReason {
  String get label => switch (this) {
    RefundReason.memberCancelCourse => 'Hủy khóa học',
    RefundReason.sessionCancelled => 'Buổi học bị hủy',
  };
}
