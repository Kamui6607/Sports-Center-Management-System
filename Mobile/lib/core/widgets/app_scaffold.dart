import 'package:flutter/material.dart';

import '../icons/app_icons.dart';
import '../theme/theme.dart';

/// Khung màn hình chuẩn: app bar, safe area, giới hạn bề rộng trên tablet,
/// thanh CTA dính đáy.
class AppScaffold extends StatelessWidget {
  const AppScaffold({
    super.key,
    required this.body,
    this.title,
    this.titleWidget,
    this.actions = const [],
    this.bottomBar,
    this.floatingActionButton,
    this.showAppBar = true,
    this.backgroundColor,
    this.leading,
    this.bottom,
  });

  final Widget body;
  final String? title;
  final Widget? titleWidget;
  final List<Widget> actions;
  final Widget? bottomBar;
  final Widget? floatingActionButton;
  final bool showAppBar;
  final Color? backgroundColor;
  final Widget? leading;
  final PreferredSizeWidget? bottom;

  @override
  Widget build(BuildContext context) {
    final canPop = Navigator.of(context).canPop();
    return Scaffold(
      backgroundColor: backgroundColor ?? context.colors.background,
      appBar: showAppBar
          ? AppBar(
              leading:
                  leading ??
                  (canPop
                      ? IconButton(
                          tooltip: 'Quay lại',
                          icon: const Icon(AppIcons.back),
                          onPressed: () => Navigator.of(context).maybePop(),
                        )
                      : null),
              automaticallyImplyLeading: false,
              title: titleWidget ?? (title == null ? null : Text(title!)),
              actions: [
                ...actions,
                const SizedBox(width: AppSpacing.xxs),
              ],
              bottom: bottom,
            )
          : null,
      floatingActionButton: floatingActionButton,
      bottomNavigationBar: bottomBar,
      body: ContentWidth(child: body),
    );
  }
}

/// Giới hạn bề rộng nội dung trên màn hình rộng (tablet), căn giữa.
class ContentWidth extends StatelessWidget {
  const ContentWidth({super.key, required this.child, this.shrinkHeight = false});

  final Widget child;

  /// `true` ⇒ chiều cao ôm nội dung (thanh dính đáy); mặc định lấp đầy cha.
  final bool shrinkHeight;

  @override
  Widget build(BuildContext context) => Align(
    alignment: Alignment.topCenter,
    heightFactor: shrinkHeight ? 1 : null,
    child: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: AppSizes.maxContentWidth),
      child: child,
    ),
  );
}

/// Thanh hành động dính đáy màn hình (giá + CTA), tôn trọng safe area.
class StickyBottomBar extends StatelessWidget {
  const StickyBottomBar({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: c.surface,
        border: Border(top: BorderSide(color: c.border)),
      ),
      child: SafeArea(
        top: false,
        child: ContentWidth(
          shrinkHeight: true,
          child: Padding(
            padding: EdgeInsets.symmetric(horizontal: context.screenPadding, vertical: AppSpacing.sm),
            child: child,
          ),
        ),
      ),
    );
  }
}
