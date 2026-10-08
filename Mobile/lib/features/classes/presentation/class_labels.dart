import 'package:flutter/widgets.dart';

import '../../../core/icons/app_icons.dart';
import '../../../core/theme/status_colors.dart';
import '../../../core/widgets/status_tag.dart';
import '../../catalog/domain/entities/catalog.dart';
import '../domain/entities/course.dart';

extension ClassStatusLabel on ClassStatus {
  StatusLabel get status => switch (this) {
    ClassStatus.pending => const StatusLabel('Chờ duyệt', StatusTone.warning),
    ClassStatus.approved => const StatusLabel('Đang mở bán', StatusTone.success),
    ClassStatus.rejected => const StatusLabel('Bị từ chối', StatusTone.danger),
    ClassStatus.completed => const StatusLabel('Đã kết thúc', StatusTone.neutral),
  };
}

extension ClassTypeLabel on ClassType {
  String get label => switch (this) {
    ClassType.regular => 'Thường',
    ClassType.premium => 'Premium',
  };

  StatusLabel get tag => switch (this) {
    ClassType.regular => const StatusLabel('Thường', StatusTone.info),
    ClassType.premium => const StatusLabel('★ Premium', StatusTone.brand),
  };
}

extension AreaTypeLabel on AreaType {
  String get label => switch (this) {
    AreaType.pool => 'Hồ bơi',
    AreaType.indoor => 'Trong nhà',
    AreaType.outdoor => 'Ngoài trời',
  };
}

/// Icon minh họa theo bộ môn (dùng cho placeholder ảnh khóa học — Q12).
IconData sportIcon(List<Sport> sports) {
  final name = sports.isEmpty ? '' : sports.first.name.toLowerCase();
  if (name.contains('bơi')) return AppIcons.zap;
  if (name.contains('gym') || name.contains('hiit') || name.contains('boxing')) return AppIcons.training;
  if (name.contains('chạy')) return AppIcons.trend;
  if (name.contains('cầu')) return AppIcons.target;
  return AppIcons.brand;
}
