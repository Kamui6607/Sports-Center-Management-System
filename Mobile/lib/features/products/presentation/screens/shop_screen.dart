import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../app/shell/header_actions.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/widgets/widgets.dart';
import '../../../auth/domain/entities/app_user.dart';
import '../../../auth/presentation/providers/session_provider.dart';
import '../../../shop/presentation/widgets/cart_button.dart';
import '../../domain/entities/product.dart';
import '../product_labels.dart';
import '../providers/product_providers.dart';

/// S01 — Cửa hàng (tab Member; màn riêng cho Coach và Guest).
class ShopScreen extends ConsumerWidget {
  const ShopScreen({super.key, this.asTab = true});

  final bool asTab;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(shopProvider);
    final user = ref.watch(currentUserProvider);
    final loggedIn = user != null;
    final isManager = user?.role == UserRole.manager;
    return AppScaffold(
      title: 'Cửa hàng',
      actions: [
        if (loggedIn && !isManager)
          AppIconButton(
            icon: AppIcons.order,
            tooltip: 'Đơn hàng của tôi',
            onPressed: () => context.push(AppRoutes.orders),
          ),
        const CartButton(),
        if (asTab) const HeaderActions(showChat: false),
      ],
      body: Column(
        children: [
          Container(
            color: context.colors.surface,
            padding: EdgeInsets.fromLTRB(context.screenPadding, AppSpacing.xs, context.screenPadding, AppSpacing.sm),
            child: SearchField(
              hint: 'Tìm sản phẩm…',
              initial: ref.read(shopSearchProvider),
              onChanged: ref.read(shopSearchProvider.notifier).set,
            ),
          ),
          const Divider(),
          Expanded(
            child: AsyncValueView(
              value: value,
              loading: Shimmer(
                child: _grid(
                  context,
                  List.generate(6, (_) => const SkeletonBox(height: double.infinity, radius: AppRadius.card)),
                ),
              ),
              onRetry: () => ref.invalidate(shopProvider),
              isEmpty: (s) => s.items.isEmpty,
              empty: const EmptyState(icon: AppIcons.bag, title: 'Không tìm thấy sản phẩm'),
              data: (s) => NotificationListener<ScrollNotification>(
                onNotification: (n) {
                  if (n.metrics.extentAfter < 300) ref.read(shopProvider.notifier).loadMore();
                  return false;
                },
                child: RefreshIndicator.adaptive(
                  onRefresh: () => ref.refresh(shopProvider.future),
                  child: _grid(context, [for (final p in s.items) ProductCard(product: p)]),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _grid(BuildContext context, List<Widget> children) => GridView.builder(
    physics: const AlwaysScrollableScrollPhysics(),
    padding: EdgeInsets.all(context.screenPadding),
    gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
      crossAxisCount: context.isWide ? 3 : 2,
      mainAxisSpacing: AppSpacing.sm,
      crossAxisSpacing: AppSpacing.sm,
      mainAxisExtent: ProductCard.heightFor(context),
    ),
    itemCount: children.length,
    itemBuilder: (_, i) => children[i],
  );
}

/// Thẻ sản phẩm trong lưới.
class ProductCard extends StatelessWidget {
  const ProductCard({super.key, required this.product});

  final Product product;

  static const _imageHeight = 120.0;
  static const _textBlockHeight = 112.0;

  /// Chiều cao thẻ = ảnh + khối chữ (khối chữ co giãn theo cỡ chữ hệ thống).
  static double heightFor(BuildContext context) =>
      _imageHeight + MediaQuery.textScalerOf(context).scale(_textBlockHeight);

  @override
  Widget build(BuildContext context) {
    final p = product;
    return Opacity(
      opacity: p.inStock ? 1 : 0.6,
      child: AppCard(
        padding: EdgeInsets.zero,
        onTap: () => context.push(AppRoutes.productDetail(p.id)),
        semanticLabel: '${p.name}, ${p.price} đồng${p.inStock ? '' : ', hết hàng'}',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: Stack(
                fit: StackFit.expand,
                children: [
                  AppNetworkImage(
                    url: p.imageUrl,
                    seed: p.id,
                    placeholderIcon: productIcon(p.name),
                    borderRadius: const BorderRadius.vertical(top: Radius.circular(AppRadius.card)),
                  ),
                  if (!p.inStock || p.lowStock)
                    Positioned(left: AppSpacing.xs, top: AppSpacing.xs, child: stockLabel(p).tag(dense: true)),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(AppSpacing.sm),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(p.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: context.text.label),
                  const SizedBox(height: AppSpacing.xxs),
                  if (p.reviewCount > 0)
                    RatingStars(rating: p.rating, size: AppSizes.iconSm - 4, count: p.reviewCount)
                  else
                    Text('Chưa có đánh giá', style: context.text.caption.copyWith(color: context.colors.textMuted)),
                  const SizedBox(height: AppSpacing.xxs),
                  MoneyText(p.price, style: context.text.bodyStrong.copyWith(color: context.colors.primary)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
