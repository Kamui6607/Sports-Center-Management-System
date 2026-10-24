import 'package:flutter/material.dart';

import '../icons/app_icons.dart';
import '../theme/theme.dart';

/// Thẻ nội dung chuẩn: nền surface, viền, bo 12, có thể bấm.
class AppCard extends StatelessWidget {
  const AppCard({
    super.key,
    required this.child,
    this.onTap,
    this.padding = const EdgeInsets.all(AppSpacing.md),
    this.color,
    this.borderColor,
    this.semanticLabel,
  });

  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsetsGeometry padding;
  final Color? color;
  final Color? borderColor;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final card = Material(
      color: color ?? c.surface,
      shape: RoundedRectangleBorder(
        borderRadius: AppRadius.cardAll,
        side: BorderSide(color: borderColor ?? c.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(padding: padding, child: child),
      ),
    );
    if (semanticLabel == null) return card;
    return Semantics(button: onTap != null, label: semanticLabel, child: card);
  }
}

/// Tiêu đề section + hành động "Xem tất cả".
class SectionHeader extends StatelessWidget {
  const SectionHeader({super.key, required this.title, this.actionLabel, this.onAction, this.padding});

  final String title;
  final String? actionLabel;
  final VoidCallback? onAction;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) => Padding(
    padding: padding ?? const EdgeInsets.only(bottom: AppSpacing.xs),
    child: Row(
      children: [
        Expanded(
          child: Semantics(header: true, child: Text(title, style: context.text.titleSmall)),
        ),
        if (actionLabel != null)
          TextButton(
            onPressed: onAction,
            style: TextButton.styleFrom(minimumSize: const Size(AppSizes.touch, AppSizes.touchMin)),
            child: Text(actionLabel!, style: context.text.label.copyWith(color: context.colors.primary)),
          ),
      ],
    ),
  );
}

/// Dòng thông tin icon + nhãn + giá trị.
class InfoRow extends StatelessWidget {
  const InfoRow({super.key, required this.icon, required this.text, this.trailing, this.color});

  final IconData icon;
  final String text;
  final Widget? trailing;
  final Color? color;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: AppSpacing.xxs),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: AppSizes.iconSm + 2, color: color ?? context.colors.textMuted),
        const SizedBox(width: AppSpacing.xs),
        Expanded(
          child: Text(text, style: context.text.small.copyWith(color: color ?? context.colors.text)),
        ),
        ?trailing,
      ],
    ),
  );
}

/// Cặp nhãn – giá trị căn hai bên (chi tiết hóa đơn, thanh toán).
class KeyValueRow extends StatelessWidget {
  const KeyValueRow({super.key, required this.label, required this.value, this.emphasize = false, this.valueColor});

  final String label;
  final String value;
  final bool emphasize;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: AppSpacing.xxs + 2),
    // Nhãn rộng theo nội dung (tối đa 60%); giá trị lấy phần còn lại và luôn căn
    // sát mép phải để các dòng thẳng cột như hóa đơn.
    child: LayoutBuilder(
      builder: (context, box) => Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ConstrainedBox(
            constraints: BoxConstraints(maxWidth: box.maxWidth * 0.6),
            child: Text(label, style: context.text.small.copyWith(color: context.colors.textMuted)),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Text(
              value,
              textAlign: TextAlign.end,
              style: (emphasize ? context.text.titleSmall : context.text.label).copyWith(
                color: valueColor ?? context.colors.text,
                fontFeatures: kTabularFigures,
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

/// Một mục menu (Tài khoản).
class MenuItemData {
  const MenuItemData({
    required this.icon,
    required this.label,
    this.onTap,
    this.trailing,
    this.subtitle,
    this.danger = false,
  });

  final IconData icon;
  final String label;
  final String? subtitle;
  final VoidCallback? onTap;
  final Widget? trailing;
  final bool danger;
}

/// Nhóm menu dạng thẻ.
class MenuList extends StatelessWidget {
  const MenuList({super.key, required this.items, this.title});

  final List<MenuItemData> items;
  final String? title;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final danger = context.tones.of(StatusTone.danger).foreground;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (title != null)
          Padding(
            padding: const EdgeInsets.only(left: AppSpacing.xxs, bottom: AppSpacing.xs),
            child: Text(title!, style: context.text.label.copyWith(color: c.textMuted)),
          ),
        AppCard(
          padding: EdgeInsets.zero,
          child: Column(
            children: [
              for (var i = 0; i < items.length; i++) ...[
                if (i > 0) const Divider(indent: AppSpacing.xxl + AppSpacing.xs),
                ListTile(
                  minTileHeight: AppSizes.touch + AppSpacing.xs,
                  leading: Icon(items[i].icon, size: AppSizes.iconLg, color: items[i].danger ? danger : c.primary),
                  title: Text(
                    items[i].label,
                    style: context.text.bodyStrong.copyWith(color: items[i].danger ? danger : c.text),
                  ),
                  subtitle: items[i].subtitle == null ? null : Text(items[i].subtitle!),
                  trailing: items[i].trailing ?? Icon(AppIcons.chevronRight, size: AppSizes.icon, color: c.textMuted),
                  onTap: items[i].onTap,
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}
