import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/data/data_revision.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/vn_time.dart';
import '../../../../core/widgets/widgets.dart';
import '../../../auth/domain/entities/app_user.dart';
import '../../../auth/presentation/providers/session_provider.dart';
import '../../../shop/data/shop_repository_provider.dart';
import '../../../shop/presentation/providers/shop_providers.dart';
import '../../../shop/presentation/shop_labels.dart';
import '../../../shop/presentation/widgets/cart_button.dart';
import '../../domain/entities/product.dart';
import '../product_labels.dart';
import '../providers/product_providers.dart';

/// S02 — Chi tiết sản phẩm: ảnh, tồn kho khả dụng, giới hạn mỗi đơn, "Thêm vào giỏ" + "Mua ngay".
/// Giỏ không giữ hàng — hàng chỉ được giữ khi tạo đơn (màn Thanh toán).
class ProductDetailScreen extends ConsumerStatefulWidget {
  const ProductDetailScreen({super.key, required this.productId});

  final String productId;

  @override
  ConsumerState<ProductDetailScreen> createState() => _ProductDetailScreenState();
}

class _ProductDetailScreenState extends ConsumerState<ProductDetailScreen> {
  int _qty = 1;
  bool _adding = false;

  Future<bool> _requireLogin(Product p) async {
    if (ref.read(currentUserProvider) != null) return true;
    await context.push('${AppRoutes.login}?from=${Uri.encodeComponent(AppRoutes.productDetail(p.id))}');
    return false;
  }

  Future<void> _addToCart(Product p) async {
    if (!await _requireLogin(p) || !mounted) return;
    setState(() => _adding = true);
    try {
      await ref.read(cartProvider.notifier).add(p.id, _qty);
      if (!mounted) return;
      AppSnackbar.success(context, 'Đã thêm ${p.name} × $_qty vào giỏ.');
      setState(() => _qty = 1);
    } on Object catch (e) {
      if (mounted) AppSnackbar.error(context, ShopErrors.message(e));
    } finally {
      if (mounted) setState(() => _adding = false);
    }
  }

  Future<void> _buyNow(Product p) async {
    if (!await _requireLogin(p) || !mounted) return;
    await context.push(AppRoutes.checkoutBuyNow(p.id, _qty));
  }

  @override
  Widget build(BuildContext context) {
    final value = ref.watch(productProvider(widget.productId));
    final user = ref.watch(currentUserProvider);
    final p = value.value;
    final canBuy = user == null || user.role != UserRole.manager;
    final max = p == null ? 1 : p.maxSelectable.clamp(1, 999);
    return AppScaffold(
      title: 'Chi tiết sản phẩm',
      actions: const [CartButton()],
      bottomBar: p == null || !canBuy
          ? null
          : StickyBottomBar(
              child: !p.inStock
                  ? AppButton(label: p.isActive ? 'Hết hàng' : 'Ngừng bán', expand: true, onPressed: null)
                  : Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Row(
                          children: [
                            Text('Số lượng', style: context.text.label),
                            const Spacer(),
                            QuantityStepper(
                              value: _qty.clamp(1, max),
                              max: max,
                              onChanged: (v) => setState(() => _qty = v),
                            ),
                          ],
                        ),
                        const SizedBox(height: AppSpacing.xs),
                        Row(
                          children: [
                            Expanded(
                              child: AppButton.outline(
                                label: 'Thêm vào giỏ',
                                icon: AppIcons.cart,
                                loading: _adding,
                                onPressed: () => _addToCart(p),
                              ),
                            ),
                            const SizedBox(width: AppSpacing.sm),
                            Expanded(
                              child: AppButton(
                                label: user == null ? 'Đăng nhập để mua' : 'Mua ngay',
                                onPressed: _adding ? null : () => _buyNow(p),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
            ),
      body: AsyncValueView(
        value: value,
        loading: const SkeletonDetail(),
        onRetry: () => ref.invalidate(productProvider(widget.productId)),
        data: (p) => RefreshableScroll(
          onRefresh: () => ref.refresh(productProvider(widget.productId).future),
          padding: EdgeInsets.zero,
          children: [
            AspectRatio(
              aspectRatio: 1.6,
              child: AppNetworkImage(
                url: p.imageUrl,
                seed: p.id,
                placeholderIcon: productIcon(p.name),
                borderRadius: BorderRadius.zero,
                iconSize: AppSpacing.xxl,
              ),
            ),
            Padding(
              padding: EdgeInsets.all(context.screenPadding),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(p.name, style: context.text.headline),
                  const SizedBox(height: AppSpacing.xs),
                  Row(
                    children: [
                      MoneyText(p.price, style: context.text.title.copyWith(color: context.colors.primary)),
                      const Spacer(),
                      stockLabel(p).tag(),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.xs),
                  if (p.reviewCount > 0) RatingStars(rating: p.rating, count: p.reviewCount),
                  const SizedBox(height: AppSpacing.sm),
                  Wrap(
                    spacing: AppSpacing.xs,
                    runSpacing: AppSpacing.xs,
                    children: [
                      StatusTag(
                        label: 'Tối đa ${p.maxPerOrder}/đơn',
                        tone: StatusTone.neutral,
                        icon: AppIcons.bag,
                        dense: true,
                      ),
                      StatusTag(
                        label: 'Tối đa ${p.maxPerDay}/ngày',
                        tone: StatusTone.neutral,
                        icon: AppIcons.calendar,
                        dense: true,
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.md),
                  Text(p.description, style: context.text.body),
                  const SizedBox(height: AppSpacing.md),
                  const AlertBanner.info(
                    message: 'Thanh toán trước bằng chuyển khoản VietQR. Nhận tại trung tâm (mang mã nhận hàng) hoặc giao tận nơi.',
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  _Reviews(productId: p.id, manager: user?.role == UserRole.manager),
                  const SizedBox(height: AppSpacing.xl),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Reviews extends ConsumerWidget {
  const _Reviews({required this.productId, required this.manager});

  final String productId;
  final bool manager;

  Future<void> _toggle(BuildContext context, WidgetRef ref, ProductReview r) async {
    final ok = await showConfirmSheet(
      context: context,
      title: r.isHidden ? 'Hiện lại đánh giá?' : 'Ẩn đánh giá?',
      message: r.isHidden
          ? 'Đánh giá sẽ hiển thị công khai và được tính vào điểm trung bình.'
          : 'Đánh giá sẽ bị ẩn khỏi khách hàng và không tính vào điểm trung bình.',
      confirmLabel: r.isHidden ? 'Hiện lại' : 'Ẩn đánh giá',
      destructive: !r.isHidden,
    );
    if (!ok || !context.mounted) return;
    final done = await runAction(
      context,
      () => ref.read(shopRepositoryProvider).setReviewHidden(r.id, !r.isHidden).then((_) => true),
      success: r.isHidden ? 'Đã hiện lại đánh giá.' : 'Đã ẩn đánh giá.',
    );
    if (done == true) ref.read(dataRevisionProvider.notifier).bump();
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reviews = ref.watch(productReviewsProvider(productId));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionHeader(title: 'Đánh giá (${reviews.value?.where((r) => !r.isHidden).length ?? 0})'),
        reviews.when(
          skipLoadingOnReload: true,
          loading: () => const Shimmer(child: SkeletonBox(height: AppSpacing.xxl)),
          error: (e, _) =>
              ErrorState(error: e, compact: true, onRetry: () => ref.invalidate(productReviewsProvider(productId))),
          data: (list) => list.isEmpty
              ? Text(
                  'Chưa có đánh giá. Người mua đánh giá từ màn Chi tiết đơn hàng sau khi đơn hoàn tất.',
                  style: context.text.small.copyWith(color: context.colors.textMuted),
                )
              : AppCard(
                  child: Column(
                    children: [
                      for (var i = 0; i < list.length; i++) ...[
                        if (i > 0) const Divider(height: AppSpacing.lg),
                        Opacity(
                          opacity: list[i].isHidden ? 0.55 : 1,
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              AppAvatar(name: list[i].userName, imageUrl: list[i].avatarUrl, size: AppSizes.avatarSm),
                              const SizedBox(width: AppSpacing.sm),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      list[i].isMine ? '${list[i].userName} (bạn)' : list[i].userName,
                                      style: context.text.label,
                                    ),
                                    RatingStars(rating: list[i].rating.toDouble()),
                                    if (list[i].comment != null) Text(list[i].comment!, style: context.text.small),
                                    Text(
                                      VnTime.date(list[i].createdAt),
                                      style: context.text.caption.copyWith(color: context.colors.textMuted),
                                    ),
                                    if (list[i].isHidden)
                                      const StatusTag(label: 'Đã ẩn', tone: StatusTone.neutral, dense: true),
                                  ],
                                ),
                              ),
                              if (manager)
                                AppIconButton(
                                  icon: list[i].isHidden ? AppIcons.eye : AppIcons.eyeOff,
                                  tooltip: list[i].isHidden ? 'Hiện đánh giá' : 'Ẩn đánh giá',
                                  onPressed: () => _toggle(context, ref, list[i]),
                                ),
                            ],
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
        ),
      ],
    );
  }
}
