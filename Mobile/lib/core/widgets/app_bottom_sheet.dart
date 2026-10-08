import 'package:flutter/material.dart';

import '../icons/app_icons.dart';
import '../theme/theme.dart';

/// Bottom sheet chuẩn (thay modal của web): tay kéo, tiêu đề, nội dung cuộn,
/// tự đẩy lên khi bàn phím mở, tôn trọng safe area.
Future<T?> showAppBottomSheet<T>({
  required BuildContext context,
  required String title,
  required WidgetBuilder builder,
  String? subtitle,
  bool isDismissible = true,
  bool expand = false,
}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    isDismissible: isDismissible,
    enableDrag: isDismissible,
    builder: (ctx) =>
        AppSheetFrame(title: title, subtitle: subtitle, expand: expand, showClose: isDismissible, child: builder(ctx)),
  );
}

class AppSheetFrame extends StatelessWidget {
  const AppSheetFrame({
    super.key,
    required this.title,
    required this.child,
    this.subtitle,
    this.expand = false,
    this.showClose = true,
  });

  final String title;
  final String? subtitle;
  final Widget child;
  final bool expand;
  final bool showClose;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final media = MediaQuery.of(context);
    final maxHeight = media.size.height * (expand ? 0.92 : 0.85);
    return Padding(
      padding: EdgeInsets.only(bottom: media.viewInsets.bottom),
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: maxHeight),
        child: Column(
          mainAxisSize: expand ? MainAxisSize.max : MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SizedBox(height: AppSpacing.xs),
            Center(
              child: Container(
                width: AppSpacing.xxl,
                height: AppSpacing.xxs,
                decoration: BoxDecoration(color: c.border, borderRadius: AppRadius.pillAll),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(AppSpacing.md, AppSpacing.sm, AppSpacing.xs, AppSpacing.xs),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Semantics(header: true, child: Text(title, style: context.text.titleSmall)),
                        if (subtitle != null) Text(subtitle!, style: context.text.small.copyWith(color: c.textMuted)),
                      ],
                    ),
                  ),
                  if (showClose)
                    IconButton(
                      tooltip: 'Đóng',
                      icon: const Icon(AppIcons.close),
                      onPressed: () => Navigator.of(context).maybePop(),
                    ),
                ],
              ),
            ),
            Flexible(
              fit: expand ? FlexFit.tight : FlexFit.loose,
              child: SingleChildScrollView(
                padding: EdgeInsets.fromLTRB(
                  AppSpacing.md,
                  AppSpacing.xs,
                  AppSpacing.md,
                  AppSpacing.md + media.padding.bottom,
                ),
                child: child,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
