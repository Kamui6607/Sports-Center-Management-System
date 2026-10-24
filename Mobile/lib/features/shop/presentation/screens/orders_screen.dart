import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/data/data_revision.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/vn_time.dart';
import '../../../../core/widgets/widgets.dart';
import '../../../products/presentation/product_labels.dart';
import '../../domain/entities/shop.dart';
import '../providers/shop_providers.dart';
import '../shop_labels.dart';

/// S03 — Đơn hàng của tôi: tab theo nhóm trạng thái.
class OrdersScreen extends ConsumerStatefulWidget {
  const OrdersScreen({super.key});

  @override
  ConsumerState<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends ConsumerState<OrdersScreen> {
  OrderGroup _group = OrderGroup.active;
  bool _pickedInitial = false;

  @override
  Widget build(BuildContext context) {
    final value = ref.watch(myOrdersProvider(_group));
    final counts = value.value?.counts ?? const OrderCounts();
    // Lần đầu: có đơn chờ thanh toán ⇒ mở tab đó để khách thanh toán kịp hạn giữ hàng.
    if (!_pickedInitial && value.hasValue) {
      _pickedInitial = true;
      if (counts.pending > 0 && _group != OrderGroup.pending) {
        WidgetsBinding.instance.addPostFrameCallback((_) => setState(() => _group = OrderGroup.pending));
      }
    }
    return AppScaffold(
      title: 'Đơn hàng của tôi',
      actions: [
        AppIconButton(
          icon: AppIcons.location,
          tooltip: 'Sổ địa chỉ',
          onPressed: () => context.push(AppRoutes.addresses),
        ),
      ],
      body: Column(
        children: [
          const SizedBox(height: AppSpacing.sm),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: SegmentedTabs<OrderGroup>(
              selected: _group,
              onChanged: (v) => setState(() => _group = v),
              options: [for (final g in OrderGroup.values) SegmentOption(g, g.label, count: counts.of(g))],
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          Expanded(
            child: AsyncValueView(
              value: value,
              onRetry: () => ref.invalidate(myOrdersProvider(_group)),
              isEmpty: (l) => l.orders.isEmpty,
              empty: EmptyState(
                icon: AppIcons.order,
                title: 'Không có đơn ${_group.label.toLowerCase()}',
                actionLabel: 'Đến cửa hàng',
                onAction: () => context.push(AppRoutes.shop),
              ),
              data: (list) => RefreshableList(
                onRefresh: () => ref.refresh(myOrdersProvider(_group).future),
                itemCount: list.orders.length,
                itemBuilder: (context, i) => OrderCard(order: list.orders[i]),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Thẻ đơn hàng (danh sách của khách & Manager).
class OrderCard extends ConsumerWidget {
  const OrderCard({super.key, required this.order, this.onTap, this.showBuyer = false});

  final ShopOrder order;
  final VoidCallback? onTap;
  final bool showBuyer;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final o = order;
    final c = context.colors;
    final first = o.lines.firstOrNull;
    final pendingOpen =
        o.status == ShopOrderStatus.pendingPayment &&
        o.paymentExpiresAt != null &&
        DateTime.now().isBefore(o.paymentExpiresAt!);
    return AppCard(
      onTap: onTap ?? () => context.push(AppRoutes.order(o.id)),
      semanticLabel: 'Đơn ${o.code}, ${o.status.status.label}',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(o.fulfillmentType.icon, size: AppSizes.iconSm, color: c.textMuted),
              const SizedBox(width: AppSpacing.xxs),
              Expanded(
                child: Text(o.code, style: context.text.label, overflow: TextOverflow.ellipsis),
              ),
              o.status.status.tag(dense: true),
            ],
          ),
          const SizedBox(height: AppSpacing.xs),
          Row(
            children: [
              SizedBox.square(
                dimension: AppSpacing.xxl,
                child: AppNetworkImage(
                  url: first?.imageUrl,
                  seed: first?.productId ?? o.id,
                  placeholderIcon: productIcon(first?.productName ?? ''),
                  iconSize: AppSizes.icon,
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(o.title, maxLines: 2, overflow: TextOverflow.ellipsis, style: context.text.bodyStrong),
                    Text(
                      '${o.itemCount} sản phẩm · ${VnTime.dateTime(o.createdAt)}'
                      '${showBuyer && o.recipientName != null ? ' · ${o.recipientName}' : ''}',
                      style: context.text.caption.copyWith(color: c.textMuted),
                    ),
                  ],
                ),
              ),
              MoneyText(o.total, style: context.text.bodyStrong),
            ],
          ),
          if (pendingOpen) ...[
            const SizedBox(height: AppSpacing.xs),
            Row(
              children: [
                Icon(AppIcons.time, size: AppSizes.iconSm, color: c.warningText),
                const SizedBox(width: AppSpacing.xxs),
                Expanded(
                  child: CountdownText(
                    deadline: o.paymentExpiresAt!,
                    prefix: 'Giữ hàng còn ',
                    style: context.text.caption.copyWith(color: c.warningText),
                    onExpired: () => ref.read(dataRevisionProvider.notifier).bump(),
                  ),
                ),
                if (!showBuyer && o.paymentId != null)
                  AppButton(
                    label: 'Thanh toán',
                    size: AppButtonSize.small,
                    onPressed: () => context.push(AppRoutes.payment(o.paymentId!)),
                  ),
              ],
            ),
          ],
          if (o.status == ShopOrderStatus.readyForPickup && o.pickupDeadline != null) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(
              'Nhận tại quầy trước ${VnTime.dateTime(o.pickupDeadline!)}',
              style: context.text.caption.copyWith(color: c.primary),
            ),
          ],
          if (o.trackingCode != null && o.status == ShopOrderStatus.shipping) ...[
            const SizedBox(height: AppSpacing.xs),
            Text('Mã vận đơn: ${o.trackingCode}', style: context.text.caption),
          ],
        ],
      ),
    );
  }
}
