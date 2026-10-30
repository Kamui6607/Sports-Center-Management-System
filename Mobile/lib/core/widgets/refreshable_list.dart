import 'package:flutter/material.dart';

import '../theme/theme.dart';

/// Danh sách có kéo-để-làm-mới, khoảng cách chuẩn giữa các mục và lề màn hình.
class RefreshableList extends StatelessWidget {
  const RefreshableList({
    super.key,
    required this.onRefresh,
    required this.itemCount,
    required this.itemBuilder,
    this.header,
    this.footer,
    this.padding,
    this.separator = AppSpacing.sm,
  });

  final Future<void> Function() onRefresh;
  final int itemCount;
  final IndexedWidgetBuilder itemBuilder;
  final Widget? header;
  final Widget? footer;
  final EdgeInsetsGeometry? padding;
  final double separator;

  @override
  Widget build(BuildContext context) {
    final extra = (header != null ? 1 : 0);
    final total = itemCount + extra + (footer != null ? 1 : 0);
    return RefreshIndicator.adaptive(
      onRefresh: onRefresh,
      child: ListView.builder(
        physics: const AlwaysScrollableScrollPhysics(),
        padding:
            padding ?? EdgeInsets.fromLTRB(context.screenPadding, AppSpacing.md, context.screenPadding, AppSpacing.xl),
        itemCount: total,
        itemBuilder: (context, index) {
          if (header != null && index == 0) return header!;
          final i = index - extra;
          if (i >= itemCount) return footer!;
          return Padding(
            padding: EdgeInsets.only(bottom: i < itemCount - 1 ? separator : 0),
            child: itemBuilder(context, i),
          );
        },
      ),
    );
  }
}

/// Bọc nội dung bất kỳ (Column…) để kéo-làm-mới được.
class RefreshableScroll extends StatelessWidget {
  const RefreshableScroll({super.key, required this.onRefresh, required this.children, this.padding});

  final Future<void> Function() onRefresh;
  final List<Widget> children;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) => RefreshIndicator.adaptive(
    onRefresh: onRefresh,
    child: ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding:
          padding ?? EdgeInsets.fromLTRB(context.screenPadding, AppSpacing.md, context.screenPadding, AppSpacing.xl),
      children: children,
    ),
  );
}
