import 'package:flutter/material.dart';

import '../icons/app_icons.dart';
import '../theme/theme.dart';

/// Chỉ báo bước cho wizard (đăng ký, tạo khóa học, hủy buổi).
class StepIndicator extends StatelessWidget {
  const StepIndicator({super.key, required this.steps, required this.current});

  final List<String> steps;
  final int current;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Semantics(
      label: 'Bước ${current + 1} trên ${steps.length}: ${steps[current]}',
      excludeSemantics: true,
      child: Row(
        children: [
          for (var i = 0; i < steps.length; i++) ...[
            if (i > 0)
              Expanded(
                child: Container(
                  height: 2,
                  margin: const EdgeInsets.only(bottom: AppSpacing.md + 2),
                  color: i <= current ? c.primary : c.border,
                ),
              ),
            Column(
              children: [
                Container(
                  width: AppSpacing.lg + 4,
                  height: AppSpacing.lg + 4,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: i < current ? c.primary : (i == current ? c.accent : c.surface),
                    border: Border.all(color: i <= current ? c.primary : c.border, width: 2),
                  ),
                  child: i < current
                      ? Icon(AppIcons.check, size: AppSizes.iconSm, color: c.onPrimary)
                      : Text(
                          '${i + 1}',
                          style: context.text.caption.copyWith(
                            color: i == current ? c.onAccent : c.textMuted,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                ),
                const SizedBox(height: AppSpacing.xxs),
                Text(
                  steps[i],
                  style: context.text.caption.copyWith(
                    color: i == current ? c.text : c.textMuted,
                    fontWeight: i == current ? FontWeight.w700 : FontWeight.w500,
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
