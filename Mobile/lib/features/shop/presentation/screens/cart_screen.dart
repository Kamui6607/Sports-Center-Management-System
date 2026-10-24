import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/money.dart';
import '../../../../core/widgets/widgets.dart';
import '../../../products/presentation/product_labels.dart';
import '../../domain/entities/shop.dart';
import '../providers/shop_providers.dart';
import '../shop_action.dart';

/// S05 — Giỏ hàng: chọn dòng để đặt, sửa số lượng, xóa, cảnh báo từng dòng (hết hàng / vượt giới hạn / giá đổi).
/// Giỏ KHÔNG giữ hàng — hàng chỉ được giữ khi tạo đơn.
class CartScreen extends ConsumerStatefulWidget {
  const CartScreen({super.key});

  @override
  ConsumerState<CartScreen> createState() => _CartScreenState();
}

class _CartScreenState extends ConsumerState<CartScreen> {
  /// Dòng bỏ chọn (mặc định chọn mọi dòng đặt được).
  final _excluded = <String>{};

  Set<String> _selected(Cart cart) => {
    for (final l in cart.lines)
      if (l.purchasable && !_excluded.contains(l.productId)) l.productId,
  };

  Future<void> _clear() async {
    final ok = await showConfirmSheet(
      context: context,
      title: 'Xóa toàn bộ giỏ hàng?',
      message: 'Mọi sản phẩm trong giỏ sẽ bị xóa.',
      confirmLabel: 'Xóa giỏ hàng',
      destructive: true,
    );
    if (!ok || !mounted) return;
    await runShopAction(context, ref, () => ref.read(cartProvider.notifier).clear(), refresh: false);
  }

  @override
  Widget build(BuildContext context) {
    final value = ref.watch(cartProvider);
    final cart = value.value;
    final selected = cart == null ? <String>{} : _selected(cart);
    final subtotal = cart?.subtotalOf(selected) ?? 0;
    return AppScaffold(
      title: 'Giỏ hàng',
      actions: [
        if (cart != null && !cart.isEmpty)
          AppIconButton(icon: AppIcons.delete, tooltip: 'Xóa giỏ hàng', onPressed: _clear),
      ],
      bottomBar: cart == null || cart.isEmpty
          ? null
          : StickyBottomBar(
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Tạm tính (${selected.length} sản phẩm)', style: context.text.caption),
                        MoneyText(subtotal, style: context.text.titleSmall.copyWith(color: context.colors.primary)),
                      ],
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  AppButton(
                    label: 'Thanh toán',
                    icon: AppIcons.payment,
                    onPressed: selected.isEmpty ? null : () => context.push(AppRoutes.checkoutCart(selected)),
                  ),
                ],
              ),
            ),
      body: AsyncValueView(
        value: value,
        onRetry: () => ref.invalidate(cartProvider),
        isEmpty: (c) => c.isEmpty,
        empty: EmptyState(
          icon: AppIcons.cart,
          title: 'Giỏ hàng trống',
          message: 'Thêm sản phẩm từ cửa hàng để đặt mua một lần.',
          actionLabel: 'Đến cửa hàng',
          onAction: () => context.push(AppRoutes.shop),
        ),
        data: (c) => RefreshableList(
          onRefresh: () => ref.refresh(cartProvider.future),
          header: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (c.hasPriceChange) ...[
                AlertBanner.warning(
                  title: 'Giá một số sản phẩm đã thay đổi',
                  message: 'Tổng tiền thanh toán luôn tính theo giá hiện tại.',
                  action: AppButton.outline(
                    label: 'Đã hiểu, cập nhật giá',
                    size: AppButtonSize.small,
                    onPressed: () => runShopAction(
                      context,
                      ref,
                      () => ref.read(cartProvider.notifier).acceptPrices(),
                      refresh: false,
                    ),
                  ),
                ),
                const SizedBox(height: AppSpacing.sm),
              ],
              Text(
                'Giỏ hàng không giữ hàng. Hàng chỉ được giữ ${ref.watch(shopConfigProvider).value?.holdMinutes ?? 15} phút khi bạn đặt đơn.',
                style: context.text.caption.copyWith(color: context.colors.textMuted),
              ),
              const SizedBox(height: AppSpacing.xs),
            ],
          ),
          itemCount: c.lines.length,
          itemBuilder: (context, i) => _CartLineCard(
            line: c.lines[i],
            selected: selected.contains(c.lines[i].productId),
            onSelected: (v) => setState(() {
              if (v) {
                _excluded.remove(c.lines[i].productId);
              } else {
                _excluded.add(c.lines[i].productId);
              }
            }),
          ),
        ),
      ),
    );
  }
}

class _CartLineCard extends ConsumerWidget {
  const _CartLineCard({required this.line, required this.selected, required this.onSelected});

  final CartLine line;
  final bool selected;
  final ValueChanged<bool> onSelected;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = line;
    final c = context.colors;
    final notifier = ref.read(cartProvider.notifier);
    final blocking = l.warnings.where((w) => !w.isPriceChange).toList();
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Checkbox.adaptive(
                value: selected,
                onChanged: l.purchasable ? (v) => onSelected(v ?? false) : null,
                semanticLabel: 'Chọn ${l.productName}',
              ),
              SizedBox.square(
                dimension: AppSpacing.xxl + AppSpacing.sm,
                child: AppNetworkImage(
                  url: l.imageUrl,
                  seed: l.productId,
                  placeholderIcon: productIcon(l.productName),
                  iconSize: AppSizes.icon,
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(l.productName, maxLines: 2, overflow: TextOverflow.ellipsis, style: context.text.bodyStrong),
                    Wrap(
                      spacing: AppSpacing.xs,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        MoneyText(l.unitPrice, style: context.text.small.copyWith(color: c.primary)),
                        if (l.priceChange?.oldPrice != null)
                          Text(
                            Money.format(l.priceChange!.oldPrice!),
                            style: context.text.caption.copyWith(
                              color: c.textMuted,
                              decoration: TextDecoration.lineThrough,
                            ),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
              AppIconButton(
                icon: AppIcons.delete,
                tooltip: 'Xóa khỏi giỏ',
                onPressed: () => runShopAction(context, ref, () => notifier.remove(l.productId), refresh: false),
              ),
            ],
          ),
          for (final w in l.warnings)
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.xxs),
              child: Row(
                children: [
                  Icon(
                    w.isPriceChange ? AppIcons.info : AppIcons.warning,
                    size: AppSizes.iconSm,
                    color: w.isPriceChange ? c.textMuted : c.errorText,
                  ),
                  const SizedBox(width: AppSpacing.xxs),
                  Expanded(
                    child: Text(
                      w.message,
                      style: context.text.caption.copyWith(color: w.isPriceChange ? c.textMuted : c.errorText),
                    ),
                  ),
                ],
              ),
            ),
          const SizedBox(height: AppSpacing.xs),
          Row(
            children: [
              if (l.isActive && l.availableStock > 0)
                QuantityStepper(
                  value: l.quantity.clamp(1, l.maxSelectable),
                  max: l.maxSelectable,
                  onChanged: (v) =>
                      runShopAction(context, ref, () => notifier.setQuantity(l.productId, v), refresh: false),
                )
              else
                Text('Số lượng: ${l.quantity}', style: context.text.small),
              const Spacer(),
              MoneyText(l.lineTotal, style: context.text.bodyStrong),
            ],
          ),
          if (blocking.isNotEmpty && l.isActive && l.availableStock > 0 && l.quantity > l.maxSelectable)
            Align(
              alignment: Alignment.centerRight,
              child: AppButton.ghost(
                label: 'Giảm còn ${l.maxSelectable}',
                size: AppButtonSize.small,
                onPressed: () => runShopAction(
                  context,
                  ref,
                  () => notifier.setQuantity(l.productId, l.maxSelectable),
                  refresh: false,
                ),
              ),
            ),
        ],
      ),
    );
  }
}
