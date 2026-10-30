import 'package:flutter/material.dart';

import '../theme/theme.dart';

/// Badge số nhỏ (chưa đọc). Ẩn khi [count] = 0; hiển thị "99+" khi lớn.
class CountBadge extends StatelessWidget {
  const CountBadge({super.key, required this.count, this.inverted = false});

  final int count;
  final bool inverted;

  @override
  Widget build(BuildContext context) {
    if (count <= 0) return const SizedBox.shrink();
    final c = context.colors;
    final danger = context.tones.of(StatusTone.danger);
    return Container(
      constraints: const BoxConstraints(minWidth: AppSizes.badge, minHeight: AppSizes.badge),
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xxs),
      decoration: BoxDecoration(
        color: inverted ? c.accent : danger.foreground,
        borderRadius: AppRadius.pillAll,
        border: Border.all(color: c.surface, width: 1.5),
      ),
      // Không dùng `alignment` của Container: nó làm badge giãn hết chiều rộng cha.
      child: Center(
        widthFactor: 1,
        heightFactor: 1,
        child: Text(
          count > 99 ? '99+' : '$count',
          style: context.text.micro.copyWith(color: inverted ? c.onAccent : c.onPrimary),
        ),
      ),
    );
  }
}
