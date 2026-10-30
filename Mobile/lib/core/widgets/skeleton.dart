import 'package:flutter/material.dart';

import '../theme/theme.dart';

/// Hiệu ứng shimmer dùng chung cho các khối skeleton con.
class Shimmer extends StatefulWidget {
  const Shimmer({super.key, required this.child});

  final Widget child;

  @override
  State<Shimmer> createState() => _ShimmerState();
}

class _ShimmerState extends State<Shimmer> with SingleTickerProviderStateMixin {
  late final _controller = AnimationController(vsync: this, duration: AppDurations.slow);

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (context.reduceMotion) {
      _controller.stop();
    } else if (!_controller.isAnimating) {
      _controller.repeat();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Semantics(
      label: 'Đang tải',
      child: AnimatedBuilder(
        animation: _controller,
        child: widget.child,
        builder: (context, child) => ShaderMask(
          blendMode: BlendMode.srcATop,
          shaderCallback: (rect) {
            final dx = rect.width * (_controller.value * 2 - 1);
            return LinearGradient(
              colors: [c.skeletonBase, c.skeletonHighlight, c.skeletonBase],
              stops: const [0.35, 0.5, 0.65],
            ).createShader(rect.shift(Offset(dx, 0)));
          },
          child: child,
        ),
      ),
    );
  }
}

/// Khối xám đại diện nội dung đang tải.
class SkeletonBox extends StatelessWidget {
  const SkeletonBox({super.key, this.width, required this.height, this.radius = AppRadius.control});

  final double? width;
  final double height;
  final double radius;

  @override
  Widget build(BuildContext context) => Container(
    width: width,
    height: height,
    decoration: BoxDecoration(color: context.colors.skeletonBase, borderRadius: BorderRadius.circular(radius)),
  );
}

/// Skeleton một thẻ (ảnh/icon + 3 dòng).
class SkeletonCard extends StatelessWidget {
  const SkeletonCard({super.key, this.withLeading = true});

  final bool withLeading;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(AppSpacing.md),
    decoration: BoxDecoration(
      color: context.colors.surface,
      borderRadius: AppRadius.cardAll,
      border: Border.all(color: context.colors.border),
    ),
    child: Row(
      children: [
        if (withLeading) ...[
          const SkeletonBox(width: AppSpacing.xxl, height: AppSpacing.xxl, radius: AppRadius.card),
          const SizedBox(width: AppSpacing.md),
        ],
        const Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SkeletonBox(width: 160, height: AppSpacing.md),
              SizedBox(height: AppSpacing.xs),
              SkeletonBox(height: AppSpacing.sm),
              SizedBox(height: AppSpacing.xs),
              SkeletonBox(width: 100, height: AppSpacing.sm),
            ],
          ),
        ),
      ],
    ),
  );
}

/// Danh sách skeleton cho màn danh sách.
class SkeletonList extends StatelessWidget {
  const SkeletonList({super.key, this.count = 5, this.withLeading = true, this.padding});

  final int count;
  final bool withLeading;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) => Shimmer(
    child: ListView.separated(
      physics: const NeverScrollableScrollPhysics(),
      padding: padding ?? EdgeInsets.all(context.screenPadding),
      itemCount: count,
      separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.sm),
      itemBuilder: (_, _) => SkeletonCard(withLeading: withLeading),
    ),
  );
}

/// Skeleton màn chi tiết (khối tiêu đề + đoạn văn).
class SkeletonDetail extends StatelessWidget {
  const SkeletonDetail({super.key});

  @override
  Widget build(BuildContext context) => Shimmer(
    child: ListView(
      physics: const NeverScrollableScrollPhysics(),
      padding: EdgeInsets.all(context.screenPadding),
      children: const [
        SkeletonBox(height: 160, radius: AppRadius.sheet),
        SizedBox(height: AppSpacing.lg),
        SkeletonBox(width: 220, height: AppSpacing.lg),
        SizedBox(height: AppSpacing.sm),
        SkeletonBox(height: AppSpacing.sm),
        SizedBox(height: AppSpacing.xs),
        SkeletonBox(height: AppSpacing.sm),
        SizedBox(height: AppSpacing.xs),
        SkeletonBox(width: 180, height: AppSpacing.sm),
        SizedBox(height: AppSpacing.lg),
        SkeletonCard(),
        SizedBox(height: AppSpacing.sm),
        SkeletonCard(),
      ],
    ),
  );
}
