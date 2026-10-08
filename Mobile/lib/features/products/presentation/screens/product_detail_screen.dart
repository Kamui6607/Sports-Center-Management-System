import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/data/data_revision.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/money.dart';
import '../../../../core/utils/vn_time.dart';
import '../../../../core/widgets/widgets.dart';
import '../../../auth/domain/entities/app_user.dart';
import '../../../auth/presentation/providers/session_provider.dart';
import '../../data/product_repository_provider.dart';
import '../../domain/entities/product.dart';
import '../product_labels.dart';
import '../providers/product_providers.dart';

/// S02 — Chi tiết sản phẩm + đặt mua (1 sản phẩm / đơn, không có giỏ hàng).
class ProductDetailScreen extends ConsumerStatefulWidget {
  const ProductDetailScreen({super.key, required this.productId});

  final String productId;

  @override
  ConsumerState<ProductDetailScreen> createState() => _ProductDetailScreenState();
}

class _ProductDetailScreenState extends ConsumerState<ProductDetailScreen> {
  int _qty = 1;
  bool _ordering = false;

  Future<void> _order(Product p) async {
    final user = ref.read(currentUserProvider);
    if (user == null) {
      await context.push('${AppRoutes.login}?from=${Uri.encodeComponent(AppRoutes.productDetail(p.id))}');
      return;
    }
    final ok = await showConfirmSheet(
      context: context,
      title: 'Xác nhận đặt mua',
      message: 'Sản phẩm được giữ cho bạn ngay khi tạo đơn. Vui lòng chuyển khoản trong thời hạn để hoàn tất.',
      confirmLabel: 'Thanh toán ${Money.format(p.price * _qty)}',
      extra: AppCard(
        color: context.colors.surfaceMuted,
        child: Column(
          children: [
            KeyValueRow(label: 'Sản phẩm', value: p.name),
            KeyValueRow(label: 'Đơn giá', value: Money.format(p.price)),
            KeyValueRow(label: 'Số lượng', value: '$_qty'),
            const Divider(),
            KeyValueRow(label: 'Tổng tiền', value: Money.format(p.price * _qty), emphasize: true),
          ],
        ),
      ),
      warning: 'Quá hạn chưa thanh toán, đơn tự hủy và hoàn lại tồn kho.',
    );
    if (!ok || !mounted) return;
    setState(() => _ordering = true);
    final checkout = await runAction(context, () => ref.read(productRepositoryProvider).createOrder(p.id, _qty));
    if (!mounted) return;
    setState(() => _ordering = false);
    if (checkout != null) {
      ref.read(dataRevisionProvider.notifier).bump();
      setState(() => _qty = 1);
      await context.push(AppRoutes.payment(checkout.paymentId));
    }
  }

  @override
  Widget build(BuildContext context) {
    final value = ref.watch(productProvider(widget.productId));
    final user = ref.watch(currentUserProvider);
    final p = value.value;
    final canBuy = user == null || user.role != UserRole.manager;
    return AppScaffold(
      title: 'Chi tiết sản phẩm',
      bottomBar: p == null || !canBuy
          ? null
          : StickyBottomBar(
              child: Row(
                children: [
                  if (p.inStock)
                    QuantityStepper(
                      value: _qty.clamp(1, p.stockQuantity),
                      max: p.stockQuantity,
                      onChanged: (v) => setState(() => _qty = v),
                    ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: AppButton(
                      label: !p.inStock ? 'Hết hàng' : (user == null ? 'Đăng nhập để mua' : 'Mua ngay'),
                      loading: _ordering,
                      onPressed: p.inStock ? () => _order(p) : null,
                    ),
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
                  const SizedBox(height: AppSpacing.md),
                  Text(p.description, style: context.text.body),
                  const SizedBox(height: AppSpacing.lg),
                  _Reviews(productId: p.id),
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
  const _Reviews({required this.productId});

  final String productId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reviews = ref.watch(productReviewsProvider(productId));
    final canReview = ref.watch(canReviewProductProvider(productId)).value ?? false;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionHeader(title: 'Đánh giá (${reviews.value?.length ?? 0})'),
        if (canReview) ...[
          AppButton.outline(
            label: 'Viết đánh giá',
            icon: AppIcons.star,
            expand: true,
            onPressed: () => showProductReviewSheet(context, productId: productId),
          ),
          const SizedBox(height: AppSpacing.sm),
        ],
        reviews.when(
          skipLoadingOnReload: true,
          loading: () => const Shimmer(child: SkeletonBox(height: AppSpacing.xxl)),
          error: (e, _) =>
              ErrorState(error: e, compact: true, onRetry: () => ref.invalidate(productReviewsProvider(productId))),
          data: (list) => list.isEmpty
              ? Text(
                  'Chưa có đánh giá. Chỉ người đã mua thành công mới được đánh giá.',
                  style: context.text.small.copyWith(color: context.colors.textMuted),
                )
              : AppCard(
                  child: Column(
                    children: [
                      for (var i = 0; i < list.length; i++) ...[
                        if (i > 0) const Divider(height: AppSpacing.lg),
                        Row(
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
                                ],
                              ),
                            ),
                          ],
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

/// S04 — Viết đánh giá sản phẩm (1 lần / sản phẩm, sau khi mua thành công).
Future<void> showProductReviewSheet(BuildContext context, {required String productId, String? productName}) =>
    showAppBottomSheet<void>(
      context: context,
      title: productName == null ? 'Đánh giá sản phẩm' : 'Đánh giá $productName',
      builder: (_) => _ReviewForm(productId: productId),
    );

class _ReviewForm extends ConsumerStatefulWidget {
  const _ReviewForm({required this.productId});

  final String productId;

  @override
  ConsumerState<_ReviewForm> createState() => _ReviewFormState();
}

class _ReviewFormState extends ConsumerState<_ReviewForm> with SubmittingState {
  int _rating = 0;
  final _comment = TextEditingController();

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    var ok = false;
    await submit(() async {
      await ref.read(productRepositoryProvider).addReview(widget.productId, _rating, _comment.text);
      ok = true;
    });
    if (!ok || !mounted) return;
    ref.read(dataRevisionProvider.notifier).bump();
    Navigator.of(context).pop();
    AppSnackbar.success(context, 'Cảm ơn bạn đã đánh giá!');
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      RatingInput(value: _rating, onChanged: (v) => setState(() => _rating = v)),
      const SizedBox(height: AppSpacing.md),
      AppTextField(label: 'Nhận xét (không bắt buộc)', controller: _comment, maxLines: 3, maxLength: 500),
      if (formError != null) ...[const SizedBox(height: AppSpacing.xs), AlertBanner.error(message: formError!)],
      const SizedBox(height: AppSpacing.md),
      AppButton(label: 'Gửi đánh giá', expand: true, loading: submitting, onPressed: _rating == 0 ? null : _submit),
    ],
  );
}
