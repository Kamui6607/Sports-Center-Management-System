import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';

import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/money.dart';
import '../../../../core/utils/vn_time.dart';
import '../../../../core/widgets/widgets.dart';
import '../../../products/presentation/product_labels.dart';
import '../../domain/entities/shop.dart';
import '../shop_labels.dart';

/// Khối đầu chi tiết đơn: mã đơn (sao chép), trạng thái, hình thức nhận, ngày đặt.
class OrderHeaderCard extends StatelessWidget {
  const OrderHeaderCard({super.key, required this.order});

  final ShopOrder order;

  @override
  Widget build(BuildContext context) {
    final o = order;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text('Đơn hàng', style: context.text.small.copyWith(color: context.colors.textMuted)),
              ),
              o.statusLabel.tag(),
            ],
          ),
          CopyableField(label: 'Mã đơn', value: o.code, emphasize: true),
          InfoRow(icon: o.fulfillmentType.icon, text: o.fulfillmentType.label),
          if (o.isPickup) InfoRow(icon: o.paymentMethod.icon, text: o.paymentMethod.label),
          if (o.isPickup && o.preferredPickupDate != null)
            InfoRow(
              icon: AppIcons.calendar,
              text:
                  'Hẹn lấy ngày ${shopDayLabel(o.preferredPickupDate!)}${o.pickupRescheduleCount > 0 ? ' (đã đổi ngày)' : ''}',
            ),
          InfoRow(icon: AppIcons.time, text: 'Đặt lúc ${VnTime.dateTime(o.createdAt)}'),
          if (o.paymentRequiresReview)
            const Padding(
              padding: EdgeInsets.only(top: AppSpacing.xs),
              child: AlertBanner.warning(message: 'Giao dịch đang được trung tâm đối soát.'),
            ),
        ],
      ),
    );
  }
}

/// Danh sách sản phẩm + tạm tính / phí ship / tổng. [lineTrailing] = nút đánh giá… cho từng dòng.
class OrderItemsCard extends StatelessWidget {
  const OrderItemsCard({super.key, required this.order, this.lineTrailing});

  final ShopOrder order;
  final Widget? Function(ShopOrderLine line)? lineTrailing;

  @override
  Widget build(BuildContext context) {
    final o = order;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final (i, l) in o.lines.indexed) ...[
            if (i > 0) const Divider(height: AppSpacing.lg),
            CostLineItem(
              leading: SizedBox.square(
                dimension: AppSpacing.xxl,
                child: AppNetworkImage(
                  url: l.imageUrl,
                  seed: l.productId,
                  placeholderIcon: productIcon(l.productName),
                  iconSize: AppSizes.icon,
                ),
              ),
              name: l.productName,
              unitPrice: l.unitPrice,
              quantity: l.quantity,
              unit: 'cái',
              total: l.total,
              footer: l.review == null
                  ? (l.isReviewExpired
                      ? Padding(
                          padding: const EdgeInsets.only(top: AppSpacing.xxs),
                          child: Text('Đã hết hạn đánh giá (quá 30 ngày)', style: context.text.caption.copyWith(color: context.colors.textMuted)),
                        )
                      : null)
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const SizedBox(height: AppSpacing.xxs),
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            RatingStars(rating: l.review!.rating.toDouble()),
                            if (l.review!.isAnonymous) ...[
                              const SizedBox(width: AppSpacing.xs),
                              const StatusTag(label: 'Ẩn danh', tone: StatusTone.neutral, dense: true),
                            ],
                            if (l.review!.editCount > 0) ...[
                              const SizedBox(width: AppSpacing.xs),
                              Text('(Đã sửa 1 lần)', style: context.text.caption.copyWith(color: context.colors.textMuted)),
                            ],
                          ],
                        ),
                        if (l.review!.comment != null) Text(l.review!.comment!, style: context.text.small),
                        if (l.review!.isHidden)
                          const StatusTag(label: 'Đánh giá đã bị ẩn', tone: StatusTone.neutral, dense: true),
                      ],
                    ),
              trailing: lineTrailing?.call(l),
            ),
          ],
          const Divider(height: AppSpacing.lg),
          CostSummary(
            subtotal: o.subtotal,
            shippingFeeLabel: CostSummary.shippingLabel(isPickup: o.isPickup, fee: o.shippingFee),
            total: o.total,
          ),
        ],
      ),
    );
  }
}

/// Người nhận + địa chỉ / vận đơn.
class OrderRecipientCard extends StatelessWidget {
  const OrderRecipientCard({super.key, required this.order, this.showFullPhone = true});

  final ShopOrder order;
  final bool showFullPhone;

  @override
  Widget build(BuildContext context) {
    final o = order;
    final phone = showFullPhone ? o.recipientPhone : (o.recipientPhoneMasked ?? o.recipientPhone);
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (o.recipientName != null) InfoRow(icon: AppIcons.user, text: o.recipientName!),
          if (phone != null) InfoRow(icon: AppIcons.phone, text: phone),
          if (o.shippingAddress != null) InfoRow(icon: AppIcons.location, text: o.shippingAddress!),
          if (o.trackingCode != null) ...[
            const SizedBox(height: AppSpacing.xs),
            CopyableField(
              label: o.carrier == null ? 'Mã vận đơn' : 'Mã vận đơn (${o.carrier})',
              value: o.trackingCode!,
            ),
          ],
          if (o.note != null && o.note!.trim().isNotEmpty) InfoRow(icon: AppIcons.file, text: 'Ghi chú: ${o.note}'),
        ],
      ),
    );
  }
}

/// Lịch sử trạng thái (timeline).
class OrderTimeline extends StatelessWidget {
  const OrderTimeline({super.key, required this.order});

  final ShopOrder order;

  @override
  Widget build(BuildContext context) => AppCard(
    child: TimelineList(
      entries: [
        for (final h in order.history.reversed)
          TimelineEntry(
            title: orderStatusLabel(h.toStatus, pickup: order.isPickup).label,
            subtitle: [
              VnTime.dateTime(h.at),
              if (h.bySystem) 'Hệ thống' else if (h.byCustomer) 'Bạn' else 'Trung tâm',
            ].join(' · '),
            body: h.reason == null ? null : Text(h.reason!, style: context.text.caption),
            tone: h.toStatus.status.tone,
          ),
      ],
    ),
  );
}

/// Yêu cầu hoàn tiền gắn với đơn.
class OrderRefundsCard extends StatelessWidget {
  const OrderRefundsCard({super.key, required this.order});

  final ShopOrder order;

  @override
  Widget build(BuildContext context) => AppCard(
    child: Column(
      children: [
        for (final r in order.refunds)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: AppSpacing.xxs),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(refundReasonLabel(r.reason), style: context.text.label),
                      Text(Money.format(r.amount), style: context.text.small),
                      if ((r.feePercent ?? 0) > 0 && r.grossAmount != null)
                        Text(
                          'Đã trừ ${r.feePercent}% phí giữ hàng (giá trị ${Money.format(r.grossAmount!)})',
                          style: context.text.caption.copyWith(color: context.colors.textMuted),
                        ),
                      if (r.hasBankInfo)
                        Text(
                          'Nhận hoàn: ${r.bankName} · ${r.bankAccountNumber} · ${r.bankAccountName}',
                          style: context.text.caption.copyWith(color: context.colors.textMuted),
                        )
                      else if (r.isPending)
                        Text(
                          'Chưa có số tài khoản nhận hoàn',
                          style: context.text.caption.copyWith(color: context.colors.warningText),
                        ),
                      if (r.payoutMethod == 'CASH') Text('Đã hoàn tiền mặt tại quầy', style: context.text.caption),
                      if (r.rejectReason != null) Text('Lý do từ chối: ${r.rejectReason}', style: context.text.caption),
                    ],
                  ),
                ),
                refundStatusLabel(r.status).tag(dense: true),
              ],
            ),
          ),
      ],
    ),
  );
}

/// Thẻ thanh toán & hóa đơn gắn với đơn hàng.
/// Cung cấp lối tắt trực tiếp tới hóa đơn thanh toán tương ứng và lịch sử thanh toán,
/// đồng thời đánh dấu rõ ràng trạng thái ĐÃ HỦY hoặc ĐÃ HOÀN TIỀN khi đơn bị hủy/hoàn.
class OrderPaymentCard extends StatelessWidget {
  const OrderPaymentCard({super.key, required this.order, this.isManager = false});

  final ShopOrder order;
  final bool isManager;

  @override
  Widget build(BuildContext context) {
    final o = order;
    final isCancelled = o.status == ShopOrderStatus.cancelled || o.status == ShopOrderStatus.expired;
    final isRefunded = o.status == ShopOrderStatus.refunded;
    final isPartiallyRefunded = !isRefunded && o.refunds.any((r) => r.status == 'COMPLETED');

    final StatusTag statusTag;
    if (isCancelled) {
      statusTag = const StatusTag(label: 'ĐÃ HỦY', tone: StatusTone.danger);
    } else if (isRefunded) {
      statusTag = const StatusTag(label: 'ĐÃ HOÀN TIỀN', tone: StatusTone.warning);
    } else if (isPartiallyRefunded) {
      statusTag = const StatusTag(label: 'HOÀN 1 PHẦN', tone: StatusTone.info);
    } else if (o.isPaid || o.status == ShopOrderStatus.paid || o.status == ShopOrderStatus.completed) {
      statusTag = const StatusTag(label: 'ĐÃ THANH TOÁN', tone: StatusTone.success);
    } else if (o.paymentMethod == ShopPaymentMethod.cash) {
      statusTag = const StatusTag(label: 'TRẢ TẠI QUẦY', tone: StatusTone.neutral);
    } else {
      statusTag = const StatusTag(label: 'CHỜ THANH TOÁN', tone: StatusTone.warning);
    }

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Trạng thái thanh toán',
                  style: context.text.small.copyWith(color: context.colors.textMuted),
                ),
              ),
              statusTag,
            ],
          ),
          const SizedBox(height: AppSpacing.xs),
          InfoRow(icon: o.paymentMethod.icon, text: 'Hình thức: ${o.paymentMethod.label}'),
          InfoRow(icon: AppIcons.wallet, text: 'Tổng tiền: ${Money.format(o.total)}'),
          if (o.amountDueAtCounter > 0)
            InfoRow(icon: AppIcons.check, text: 'Cần trả tại quầy: ${Money.format(o.amountDueAtCounter)}'),
          if (isCancelled) ...[
            const SizedBox(height: AppSpacing.xs),
            const AlertBanner.error(message: 'Đơn hàng đã bị hủy. Hóa đơn tương ứng được đánh dấu ĐÃ HỦY.'),
          ] else if (isRefunded || isPartiallyRefunded) ...[
            const SizedBox(height: AppSpacing.xs),
            AlertBanner.warning(
              message: isRefunded
                  ? 'Đơn hàng đã được hoàn tiền toàn bộ. Hóa đơn tương ứng được đánh dấu ĐÃ HOÀN TIỀN.'
                  : 'Đơn hàng có khoản hoàn tiền. Hóa đơn tương ứng được đánh dấu HOÀN 1 PHẦN.',
            ),
          ],
          const SizedBox(height: AppSpacing.sm),
          const Divider(height: AppSpacing.sm),
          const SizedBox(height: AppSpacing.xs),
          if (o.paymentId != null) ...[
            AppButton.outline(
              label: 'Xem hóa đơn thanh toán',
              icon: AppIcons.invoice,
              expand: true,
              onPressed: () => context.push(AppRoutes.invoice(o.paymentId!)),
            ),
            const SizedBox(height: AppSpacing.xs),
          ],
          AppButton.ghost(
            label: 'Lịch sử thanh toán',
            icon: AppIcons.time,
            size: AppButtonSize.small,
            expand: true,
            onPressed: () => context.push(AppRoutes.invoices),
          ),
        ],
      ),
    );
  }
}
