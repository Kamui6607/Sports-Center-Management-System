import 'package:flutter/material.dart';

import '../icons/app_icons.dart';
import '../theme/theme.dart';

/// Hiển thị sao (hỗ trợ nửa sao bằng độ mờ).
class RatingStars extends StatelessWidget {
  const RatingStars({super.key, required this.rating, this.size = AppSizes.iconSm, this.count});

  final double rating;
  final double size;
  final int? count;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final star = context.tones.of(StatusTone.warning).foreground;
    return Semantics(
      label: 'Đánh giá ${rating.toStringAsFixed(1)} trên 5${count != null ? ', $count lượt' : ''}',
      excludeSemantics: true,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var i = 1; i <= 5; i++)
            Icon(
              AppIcons.starFilled,
              size: size,
              color: rating >= i - 0.25 ? star : (rating >= i - 0.75 ? star.withValues(alpha: 0.5) : c.border),
            ),
          if (count != null) ...[
            const SizedBox(width: AppSpacing.xxs),
            Flexible(
              child: Text(
                '${rating.toStringAsFixed(1)} ($count)',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: context.text.caption.copyWith(color: c.textMuted),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Chọn số sao 1–5.
class RatingInput extends StatelessWidget {
  const RatingInput({super.key, required this.value, required this.onChanged});

  final int value;
  final ValueChanged<int> onChanged;

  static const labels = ['Rất tệ', 'Chưa tốt', 'Bình thường', 'Tốt', 'Tuyệt vời'];

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final star = context.tones.of(StatusTone.warning).foreground;
    return Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            for (var i = 1; i <= 5; i++)
              IconButton(
                tooltip: '$i sao',
                iconSize: AppSizes.iconXl,
                onPressed: () => onChanged(i),
                icon: Icon(AppIcons.starFilled, color: i <= value ? star : c.border),
              ),
          ],
        ),
        Text(
          value == 0 ? 'Chạm để chọn số sao' : labels[value - 1],
          style: context.text.label.copyWith(color: c.textMuted),
        ),
      ],
    );
  }
}

/// Tổng hợp đánh giá: điểm trung bình + phân bố 5→1.
class RatingSummary extends StatelessWidget {
  const RatingSummary({super.key, required this.average, required this.count, required this.distribution});

  final double average;
  final int count;

  /// Số lượt theo sao, khóa 1..5.
  final Map<int, int> distribution;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final star = context.tones.of(StatusTone.warning).foreground;
    return Row(
      children: [
        Column(
          children: [
            Text(average.toStringAsFixed(1), style: context.text.display),
            RatingStars(rating: average),
            const SizedBox(height: AppSpacing.xxs),
            Text('$count đánh giá', style: context.text.caption.copyWith(color: c.textMuted)),
          ],
        ),
        const SizedBox(width: AppSpacing.lg),
        Expanded(
          child: Column(
            children: [
              for (var s = 5; s >= 1; s--)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 2),
                  child: Row(
                    children: [
                      SizedBox(
                        width: AppSpacing.sm,
                        child: Text('$s', style: context.text.caption),
                      ),
                      const SizedBox(width: AppSpacing.xxs),
                      Expanded(
                        child: ClipRRect(
                          borderRadius: AppRadius.pillAll,
                          child: LinearProgressIndicator(
                            value: count == 0 ? 0 : (distribution[s] ?? 0) / count,
                            minHeight: AppSpacing.xs - 2,
                            color: star,
                            backgroundColor: c.border,
                          ),
                        ),
                      ),
                      SizedBox(
                        width: AppSpacing.lg,
                        child: Text(
                          '${distribution[s] ?? 0}',
                          textAlign: TextAlign.end,
                          style: context.text.caption.copyWith(color: c.textMuted),
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}
