import '../../../core/theme/status_colors.dart';
import '../../../core/widgets/status_tag.dart';
import '../domain/entities/app_user.dart';
import '../domain/entities/auth_models.dart';

/// Nhãn tiếng Việt cho enum của feature auth.
extension GenderLabel on Gender {
  String get label => switch (this) {
    Gender.male => 'Nam',
    Gender.female => 'Nữ',
    Gender.other => 'Khác',
  };
}

extension TrainingLevelLabel on TrainingLevel {
  String get label => switch (this) {
    TrainingLevel.beginner => 'Cơ bản',
    TrainingLevel.intermediate => 'Trung cấp',
    TrainingLevel.advanced => 'Nâng cao',
  };
}

extension UserRoleLabel on UserRole {
  String get label => switch (this) {
    UserRole.member => 'Học viên',
    UserRole.coach => 'Huấn luyện viên',
    UserRole.manager => 'Quản lý',
  };
}

extension CoachApprovalLabel on CoachApprovalStatus {
  StatusLabel get status => switch (this) {
    CoachApprovalStatus.pending => const StatusLabel('Đang chờ duyệt', StatusTone.warning),
    CoachApprovalStatus.approved => const StatusLabel('Đã duyệt', StatusTone.success),
    CoachApprovalStatus.rejected => const StatusLabel('Bị từ chối', StatusTone.danger),
  };
}
