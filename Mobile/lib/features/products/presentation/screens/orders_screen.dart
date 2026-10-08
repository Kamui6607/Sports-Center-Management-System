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
import '../../data/product_repository_provider.dart';
import '../../domain/entities/product.dart';
import '../product_labels.dart';
import '../providers/product_providers.dart';
import 'product_detail_screen.dart';

/// S03 — Đơn hàng của tôi.
class OrdersScreen extends ConsumerStatefulWidget {
  const OrdersScreen({super.key});

  @override
  ConsumerState<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends ConsumerState<OrdersScreen> {
  OrderStatus _status = OrderStatus.pending;

  @override
  Widget build(BuildContext context) {
    final value = ref.watch(myOrdersProvider);
    final all = value.value ?? const <ProductOrder>[];
    return AppScaffold(
      title: 'Đơn hàng của tôi',
      body: Column(
        children: [
          const SizedBox(height: AppSpacing.sm),
          SegmentedTabs<OrderStatus>(
            selected: _status,
            onChanged: (v) => setState(() => _status = v),
            options: [
              for (final s in OrderStatus.values)
                SegmentOption(s, s.status.label, count: all.where((o) => o.status == s).length),
            ],
          ),
          const SizedBox(height: AppSpacing.xs),
          Expanded(
            child: AsyncValueView(
              value: value,
              onRetry: () => ref.invalidate(myOrdersProvider),
              data: (list) {
                final items = list.where((o) => o.status == _status).toList();
                if (items.isEmpty) {
                  return EmptyState(
                    icon: AppIcons.order,
                    title: 'Không có đơn ${_status.status.label.toLowerCase()}',
                    actionLabel: 'Đến cửa hàng',
                    onAction: () => context.push(AppRoutes.shop),
                  );
                }
                return RefreshableList(
                  onRefresh: () => ref.refresh(myOrdersProvider.future),
                  itemCount: items.length,
                  itemBuilder: (context, i) => _OrderCard(order: items[i]),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _OrderCard extends ConsumerWidget {
  const _OrderCard({required this.order});

  final ProductOrder order;

  Future<void> _cancel(BuildContext context, WidgetRef ref) async {
    final ok = await showConfirmSheet(
      context: context,
      title: 'Hủy đơn hàng?',
      message:
          'Đơn "${order.productName} × ${order.quantity}" sẽ bị hủy và tồn kho được hoàn lại. Nếu bạn ĐÃ chuyển khoản, đừng hủy — hãy chờ hệ thống xác nhận.',
      confirmLabel: 'Hủy đơn',
      destructive: true,
    );
    if (!ok || !context.mounted) return;
    final done = await runAction(
      context,
      () => ref.read(productRepositoryProvider).cancelOrder(order.id).then((_) => true),
      success: 'Đã hủy đơn hàng.',
    );
    if (done == true) ref.read(dataRevisionProvider.notifier).bump();
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final o = order;
    final c = context.colors;
    final now = DateTime.now();
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              SizedBox.square(
                dimension: AppSpacing.xxl,
                child: AppNetworkImage(
                  url: null,
                  seed: o.productId,
                  placeholderIcon: productIcon(o.productName),
                  iconSize: AppSizes.icon,
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(o.productName, style: context.text.bodyStrong),
                    Text(
                      '${Money.format(o.unitPrice)} × ${o.quantity} · ${VnTime.dateTime(o.createdAt)}',
                      style: context.text.caption.copyWith(color: c.textMuted),
                    ),
                  ],
                ),
              ),
              o.status.status.tag(dense: true),
            ],
          ),
          const Divider(height: AppSpacing.lg),
          Row(
            children: [
              Text('Tổng tiền', style: context.text.small.copyWith(color: c.textMuted)),
              const Spacer(),
              MoneyText(o.totalPrice, style: context.text.titleSmall),
            ],
          ),
          if (o.status == OrderStatus.pending && o.expiresAt != null && now.isBefore(o.expiresAt!)) ...[
            const SizedBox(height: AppSpacing.xs),
            Row(
              children: [
                Icon(AppIcons.time, size: AppSizes.iconSm, color: c.warningText),
                const SizedBox(width: AppSpacing.xxs),
                CountdownText(
                  deadline: o.expiresAt!,
                  prefix: 'Giữ hàng còn ',
                  style: context.text.caption.copyWith(color: c.warningText),
                  onExpired: () => ref.read(dataRevisionProvider.notifier).bump(),
                ),
              ],
            ),
          ],
          if (o.status == OrderStatus.cancelled && o.cancelReason != null) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(o.cancelReason!.label, style: context.text.caption.copyWith(color: c.textMuted)),
          ],
          const SizedBox(height: AppSpacing.sm),
          switch (o.status) {
            OrderStatus.pending => Row(
              children: [
                Expanded(
                  child: AppButton.outline(
                    label: 'Hủy đơn',
                    size: AppButtonSize.small,
                    onPressed: () => _cancel(context, ref),
                  ),
                ),
                const SizedBox(width: AppSpacing.xs),
                Expanded(
                  child: AppButton(
                    label: 'Thanh toán',
                    size: AppButtonSize.small,
                    onPressed: o.paymentId == null ? null : () => context.push(AppRoutes.payment(o.paymentId!)),
                  ),
                ),
              ],
            ),
            OrderStatus.success => Row(
              children: [
                if (o.invoiceId != null)
                  Expanded(
                    child: AppButton.outline(
                      label: 'Hóa đơn',
                      icon: AppIcons.invoice,
                      size: AppButtonSize.small,
                      onPressed: () => context.push(AppRoutes.invoice(o.invoiceId!)),
                    ),
                  ),
                const SizedBox(width: AppSpacing.xs),
                Expanded(
                  child: o.reviewed
                      ? const AppButton.ghost(
                          label: 'Đã đánh giá',
                          icon: AppIcons.check,
                          size: AppButtonSize.small,
                          onPressed: null,
                        )
                      : AppButton.secondary(
                          label: 'Đánh giá',
                          icon: AppIcons.star,
                          size: AppButtonSize.small,
                          onPressed: () =>
                              showProductReviewSheet(context, productId: o.productId, productName: o.productName),
                        ),
                ),
              ],
            ),
            OrderStatus.cancelled => AppButton.ghost(
              label: 'Mua lại',
              size: AppButtonSize.small,
              onPressed: () => context.push(AppRoutes.productDetail(o.productId)),
            ),
          },
        ],
      ),
    );
  }
}
