import 'package:flutter/material.dart';

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
              o.status.status.tag(),
            ],
          ),
          CopyableField(label: 'Mã đơn', value: o.code, emphasize: true),
          InfoRow(icon: o.fulfillmentType.icon, text: o.fulfillmentType.label),
          InfoRow(icon: AppIcons.calendar, text: 'Đặt lúc ${VnTime.dateTime(o.createdAt)}'),
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
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox.square(
                  dimension: AppSpacing.xxl,
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
                      Text(l.productName, style: context.text.bodyStrong),
                      Text(
                        '${Money.format(l.unitPrice)} × ${l.quantity}',
                        style: context.text.caption.copyWith(color: context.colors.textMuted),
                      ),
                      if (l.review != null) ...[
                        const SizedBox(height: AppSpacing.xxs),
                        RatingStars(rating: l.review!.rating.toDouble()),
                        if (l.review!.comment != null) Text(l.review!.comment!, style: context.text.small),
                        if (l.review!.isHidden)
                          const StatusTag(label: 'Đánh giá đã bị ẩn', tone: StatusTone.neutral, dense: true),
                      ],
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    MoneyText(l.total, style: context.text.bodyStrong),
                    ?lineTrailing?.call(l),
                  ],
                ),
              ],
            ),
          ],
          const Divider(height: AppSpacing.lg),
          KeyValueRow(label: 'Tạm tính', value: Money.format(o.subtotal)),
          KeyValueRow(
            label: 'Phí giao hàng',
            value: o.isPickup ? 'Không có' : (o.shippingFee == 0 ? 'Miễn phí' : Money.format(o.shippingFee)),
          ),
          KeyValueRow(label: 'Tổng thanh toán', value: Money.format(o.total), emphasize: true),
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
            title: h.toStatus.status.label,
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
