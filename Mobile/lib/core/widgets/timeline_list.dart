import 'package:flutter/material.dart';

import '../theme/theme.dart';

class TimelineEntry {
  const TimelineEntry({
    required this.title,
    this.subtitle,
    this.body,
    this.tone = StatusTone.neutral,
    this.done = true,
  });

  final String title;
  final String? subtitle;
  final Widget? body;
  final StatusTone tone;
  final bool done;
}

/// Dòng thời gian dọc (trạng thái hồ sơ CV, hoàn tiền, kết quả tập).
class TimelineList extends StatelessWidget {
  const TimelineList({super.key, required this.entries});

  final List<TimelineEntry> entries;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Column(
      children: [
        for (var i = 0; i < entries.length; i++)
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SizedBox(
                  width: AppSpacing.lg,
                  child: Column(
                    children: [
                      const SizedBox(height: AppSpacing.xxs),
                      Container(
                        width: AppSizes.dot + 4,
                        height: AppSizes.dot + 4,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: entries[i].done ? context.tones.of(entries[i].tone).foreground : c.surface,
                          border: Border.all(
                            color: entries[i].done ? context.tones.of(entries[i].tone).foreground : c.borderStrong,
                            width: 2,
                          ),
                        ),
                      ),
                      if (i < entries.length - 1) Expanded(child: Container(width: 2, color: c.border)),
                    ],
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Padding(
                    padding: EdgeInsets.only(bottom: i < entries.length - 1 ? AppSpacing.md : 0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          entries[i].title,
                          style: context.text.label.copyWith(color: entries[i].done ? c.text : c.textMuted),
                        ),
                        if (entries[i].subtitle != null)
                          Text(entries[i].subtitle!, style: context.text.caption.copyWith(color: c.textMuted)),
                        if (entries[i].body != null) ...[const SizedBox(height: AppSpacing.xs), entries[i].body!],
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}
