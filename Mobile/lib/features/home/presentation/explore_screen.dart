import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/icons/app_icons.dart';
import '../../../core/theme/theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../classes/presentation/providers/course_providers.dart';
import '../../classes/presentation/widgets/class_card.dart';
import '../../products/presentation/providers/product_providers.dart';
import '../../products/presentation/screens/shop_screen.dart';

/// G01 — Khám phá cho Guest: khóa học nổi bật + sản phẩm + CTA đăng ký (Q2).
class ExploreScreen extends ConsumerWidget {
  const ExploreScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final classes = ref.watch(browseClassesProvider);
    final products = ref.watch(shopProvider);
    final c = context.colors;
    return AppScaffold(
      titleWidget: const BrandLogo(),
      actions: [TextButton(onPressed: () => context.push(AppRoutes.login), child: const Text('Đăng nhập'))],
      body: RefreshableScroll(
        onRefresh: () async {
          ref.invalidate(shopProvider);
          ref.invalidate(browseClassesProvider);
          await ref.read(browseClassesProvider.future);
        },
        children: [
          AppCard(
            color: c.primary,
            borderColor: c.primary,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Bắt đầu hành trình tập luyện', style: context.text.title.copyWith(color: c.onPrimary)),
                const SizedBox(height: AppSpacing.xs),
                Text(
                  'Tạo tài khoản miễn phí để mua khóa học, nhận lịch tập và điểm danh bằng QR.',
                  style: context.text.small.copyWith(color: c.onPrimary.withValues(alpha: 0.85)),
                ),
                const SizedBox(height: AppSpacing.md),
                AppButton.secondary(label: 'Tạo tài khoản', onPressed: () => context.push(AppRoutes.register)),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          SectionHeader(
            title: 'Khóa học đang mở',
            actionLabel: 'Xem tất cả',
            onAction: () => context.push(AppRoutes.exploreClasses),
          ),
          AsyncValueView(
            value: classes,
            loading: const Shimmer(child: SkeletonCard()),
            onRetry: () => ref.invalidate(browseClassesProvider),
            data: (s) => Column(
              children: [
                for (final course in s.items.take(3))
                  Padding(
                    padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                    child: ClassCard(course: course, onTap: () => context.push(AppRoutes.classDetail(course.id))),
                  ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          SectionHeader(title: 'Sản phẩm', actionLabel: 'Cửa hàng', onAction: () => context.push(AppRoutes.shop)),
          AsyncValueView(
            value: products,
            loading: const Shimmer(child: SkeletonBox(height: AppSpacing.xxl * 4)),
            onRetry: () => ref.invalidate(shopProvider),
            data: (s) => SizedBox(
              height: ProductCard.heightFor(context),
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: s.items.take(6).length,
                separatorBuilder: (_, _) => const SizedBox(width: AppSpacing.sm),
                itemBuilder: (_, i) => SizedBox(
                  width: AppSpacing.xxl * 3 + AppSpacing.md,
                  child: ProductCard(product: s.items[i]),
                ),
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          AppCard(
            child: Row(
              children: [
                Icon(AppIcons.graduation, color: c.primary),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Text('Bạn là huấn luyện viên? Đăng ký và nộp CV để mở khóa học.', style: context.text.small),
                ),
                TextButton(onPressed: () => context.push(AppRoutes.register), child: const Text('Đăng ký')),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.xl),
        ],
      ),
    );
  }
}
