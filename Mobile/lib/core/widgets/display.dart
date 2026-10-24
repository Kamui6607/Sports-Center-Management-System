import 'package:flutter/material.dart';

import '../theme/theme.dart';
import '../utils/money.dart';

/// Hiển thị tiền VND (chữ số dạng bảng). [signed] ⇒ thêm +/− và tô màu.
class MoneyText extends StatelessWidget {
  const MoneyText(this.amount, {super.key, this.style, this.signed = false, this.color});

  final int amount;
  final TextStyle? style;
  final bool signed;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final base = style ?? context.text.bodyStrong;
    final c = context.colors;
    final resolved = color ?? (signed ? (amount >= 0 ? c.successText : c.errorText) : base.color);
    return Text(
      signed ? Money.signed(amount) : Money.format(amount),
      style: base.copyWith(color: resolved, fontFeatures: kTabularFigures),
    );
  }
}

/// Thanh tiến độ có nhãn "x/y buổi".
class LabeledProgress extends StatelessWidget {
  const LabeledProgress({super.key, required this.value, required this.total, required this.label});

  final int value;
  final int total;
  final String label;

  @override
  Widget build(BuildContext context) {
    final ratio = total == 0 ? 0.0 : (value / total).clamp(0.0, 1.0);
    return Semantics(
      label: '$label: $value trên $total',
      excludeSemantics: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(label, style: context.text.caption.copyWith(color: context.colors.textMuted)),
              ),
              Text('$value/$total', style: context.text.caption.copyWith(fontFeatures: kTabularFigures)),
            ],
          ),
          const SizedBox(height: AppSpacing.xxs),
          ClipRRect(
            borderRadius: AppRadius.pillAll,
            child: LinearProgressIndicator(
              value: ratio,
              minHeight: AppSpacing.xs - 2,
              color: context.colors.accentStrong,
              backgroundColor: context.colors.border,
            ),
          ),
        ],
      ),
    );
  }
}

/// Vòng tiến độ có % ở giữa (tỷ lệ chuyên cần).
class ProgressRing extends StatelessWidget {
  const ProgressRing({super.key, required this.ratio, this.size = AppSpacing.xxl + AppSpacing.md, this.color});

  final double ratio;
  final double size;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final percent = (ratio * 100).round();
    return Semantics(
      label: 'Tỷ lệ $percent phần trăm',
      excludeSemantics: true,
      child: SizedBox.square(
        dimension: size,
        child: Stack(
          fit: StackFit.expand,
          children: [
            CircularProgressIndicator(
              value: ratio.clamp(0, 1),
              strokeWidth: AppSpacing.xs - 2,
              color: color ?? context.colors.primary,
              backgroundColor: context.colors.border,
              strokeCap: StrokeCap.round,
            ),
            Center(
              child: Text('$percent%', style: context.text.label.copyWith(fontFeatures: kTabularFigures)),
            ),
          ],
        ),
      ),
    );
  }
}

/// Ô số liệu tổng quan.
class KpiTile extends StatelessWidget {
  const KpiTile({
    super.key,
    required this.icon,
    required this.label,
    required this.value,
    this.onTap,
    this.highlight = false,
  });

  final IconData icon;
  final String label;
  final String value;
  final VoidCallback? onTap;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final fg = highlight ? c.onPrimary : c.text;
    return Semantics(
      label: '$label: $value',
      button: onTap != null,
      excludeSemantics: true,
      child: Material(
        color: highlight ? c.primary : c.surface,
        shape: RoundedRectangleBorder(
          borderRadius: AppRadius.cardAll,
          side: BorderSide(color: highlight ? c.primary : c.border),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.md),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(icon, size: AppSizes.icon, color: highlight ? c.accent : c.accentStrong),
                const SizedBox(height: AppSpacing.xs),
                Text(
                  value,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: context.text.title.copyWith(color: fg, fontFeatures: kTabularFigures),
                ),
                Text(
                  label,
                  maxLines: 2,
                  style: context.text.caption.copyWith(color: highlight ? c.accent : c.textMuted),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Lưới 2 cột (phone) / 4 cột (tablet) cho KPI.
class KpiGrid extends StatelessWidget {
  const KpiGrid({super.key, required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) => ResponsiveGrid(columns: context.isWide ? 4 : 2, children: children);
}

/// Lưới chiều cao tự co theo nội dung (không cố định tỉ lệ ⇒ không tràn khi
/// phóng to chữ). Dùng cho số ít phần tử, không cuộn ảo.
class ResponsiveGrid extends StatelessWidget {
  const ResponsiveGrid({super.key, required this.columns, required this.children});

  final int columns;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final width = ((constraints.maxWidth - AppSpacing.sm * (columns - 1)) / columns).floorToDouble();
        return Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.sm,
          children: [for (final child in children) SizedBox(width: width, child: child)],
        );
      },
    );
  }
}
