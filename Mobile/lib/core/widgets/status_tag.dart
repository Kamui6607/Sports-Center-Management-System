import 'package:flutter/material.dart';

import '../theme/theme.dart';

/// Nhãn trạng thái nghiệp vụ. Mapping giá trị ⇒ (nhãn, tone) nằm ở từng
/// feature (`presentation/..._labels.dart`), widget này chỉ hiển thị.
class StatusTag extends StatelessWidget {
  const StatusTag({super.key, required this.label, required this.tone, this.icon, this.dense = false});

  final String label;
  final StatusTone tone;
  final IconData? icon;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final colors = context.tones.of(tone);
    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: dense ? AppSpacing.xs - 2 : AppSpacing.xs,
        vertical: dense ? 1 : AppSpacing.xxs - 1,
      ),
      decoration: BoxDecoration(
        color: colors.background,
        borderRadius: AppRadius.controlAll,
        border: Border.all(color: colors.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: AppSizes.iconSm - 2, color: colors.foreground),
            const SizedBox(width: AppSpacing.xxs),
          ],
          Flexible(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: context.text.caption.copyWith(color: colors.foreground, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}

/// Nhãn trạng thái kèm tone, dùng làm kiểu trả về của các hàm mapping.
@immutable
class StatusLabel {
  const StatusLabel(this.label, this.tone);

  final String label;
  final StatusTone tone;

  StatusTag tag({IconData? icon, bool dense = false}) => StatusTag(label: label, tone: tone, icon: icon, dense: dense);
}
