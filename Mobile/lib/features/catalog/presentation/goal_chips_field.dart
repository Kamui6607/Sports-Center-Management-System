import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/theme.dart';
import '../../../core/widgets/widgets.dart';
import '../domain/entities/catalog.dart';
import 'location_card.dart';

/// Chọn nhiều mục tiêu tập luyện từ danh mục gợi ý (`GET /classes/goal-options`), tối đa [max] mục.
/// Dùng ở hồ sơ học viên (mục tiêu của tôi) và wizard tạo khóa (mục tiêu khóa học).
class GoalChipsField extends ConsumerWidget {
  const GoalChipsField({
    super.key,
    required this.label,
    required this.selected,
    required this.onChanged,
    required this.max,
    this.helper,
    this.errorText,
    this.requiredField = false,
  });

  final String label;
  final List<String> selected;
  final ValueChanged<List<String>> onChanged;
  final int max;
  final String? helper;
  final String? errorText;
  final bool requiredField;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final options = ref.watch(goalOptionsProvider).value ?? kFitnessGoals;
    final c = context.colors;
    final danger = context.tones.of(StatusTone.danger).foreground;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text.rich(
          TextSpan(
            text: label,
            children: [
              if (requiredField)
                TextSpan(
                  text: ' *',
                  style: TextStyle(color: danger),
                ),
              TextSpan(
                text: '  (${selected.length}/$max)',
                style: context.text.caption.copyWith(color: c.textMuted),
              ),
            ],
          ),
          style: context.text.label,
        ),
        if (helper != null) ...[
          const SizedBox(height: AppSpacing.xxs),
          Text(helper!, style: context.text.caption.copyWith(color: c.textMuted)),
        ],
        const SizedBox(height: AppSpacing.xs),
        Wrap(
          spacing: AppSpacing.xs,
          runSpacing: AppSpacing.xs,
          children: [
            for (final g in options)
              Tooltip(
                message: g.description ?? g.label,
                child: AppChip(
                  label: g.label,
                  selected: selected.contains(g.code),
                  onTap: () {
                    final next = [...selected];
                    if (next.contains(g.code)) {
                      next.remove(g.code);
                    } else if (next.length < max) {
                      next.add(g.code);
                    } else {
                      AppSnackbar.info(context, 'Chọn tối đa $max mục tiêu.');
                      return;
                    }
                    onChanged(next);
                  },
                ),
              ),
          ],
        ),
        if (errorText != null) ...[
          const SizedBox(height: AppSpacing.xxs),
          Text(errorText!, style: context.text.caption.copyWith(color: danger)),
        ],
      ],
    );
  }
}
