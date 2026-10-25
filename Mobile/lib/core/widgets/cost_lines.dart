import 'package:flutter/material.dart';

import '../theme/theme.dart';
import '../utils/money.dart';
import 'app_card.dart';
import 'display.dart';

/// Một dòng hàng trên đơn / hóa đơn: tên, **đơn giá × số lượng** và **thành tiền** — cùng một cách trình bày ở
/// màn đặt hàng, màn thanh toán, hóa đơn và lịch sử mua (giá lấy theo ảnh chụp lúc mua do BE trả về).
class CostLineItem extends StatelessWidget {
  const CostLineItem({
    super.key,
    required this.name,
    required this.unitPrice,
    required this.quantity,
    required this.total,
    this.unit,
    this.description,
    this.leading,
    this.footer,
    this.trailing,
  });

  final String name;
  final int unitPrice;
  final int quantity;
  final int total;

  /// Đơn vị tính (cái / khóa / gói) — bỏ trống thì không ghi.
  final String? unit;
  final String? description;
  final Widget? leading;

  /// Nội dung thêm dưới dòng giá (VD đánh giá sản phẩm).
  final Widget? footer;

  /// Nội dung thêm dưới thành tiền (VD nút đánh giá).
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final muted = context.text.caption.copyWith(color: context.colors.textMuted);
    final qty = unit == null ? 'SL $quantity' : 'SL $quantity $unit';
    return Semantics(
      label: '$name, đơn giá ${Money.format(unitPrice)}, $qty, thành tiền ${Money.format(total)}',
      excludeSemantics: true,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (leading != null) ...[leading!, const SizedBox(width: AppSpacing.sm)],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name, style: context.text.bodyStrong),
                if (description != null && description!.isNotEmpty) Text(description!, style: muted),
                Text('Đơn giá ${Money.format(unitPrice)} × $qty', style: muted.copyWith(fontFeatures: kTabularFigures)),
                ?footer,
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text('Thành tiền', style: muted),
              MoneyText(total, style: context.text.label),
              ?trailing,
            ],
          ),
        ],
      ),
    );
  }
}

/// Khối tổng hợp chi phí: Tạm tính → Giảm giá (nếu có) → Phí giao hàng (nếu áp dụng) → **Tổng thanh toán**.
class CostSummary extends StatelessWidget {
  const CostSummary({
    super.key,
    required this.subtotal,
    required this.total,
    this.discount = 0,
    this.discountLabel,
    this.shippingFeeLabel,
    this.totalLabel = 'Tổng thanh toán',
  });

  final int subtotal;
  final int total;
  final int discount;
  final String? discountLabel;

  /// Giá trị dòng "Phí giao hàng" đã định dạng (VD "30.000 ₫", "Miễn phí", "Nhận tại quầy") — null ⇒ không áp dụng.
  final String? shippingFeeLabel;
  final String totalLabel;

  /// Nhãn phí giao hàng chuẩn cho đơn sản phẩm.
  static String shippingLabel({required bool isPickup, required int fee}) =>
      isPickup ? 'Nhận tại quầy (0 ₫)' : (fee == 0 ? 'Miễn phí' : Money.format(fee));

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      KeyValueRow(label: 'Tạm tính', value: Money.format(subtotal)),
      if (discount > 0)
        KeyValueRow(
          label: discountLabel ?? 'Giảm giá',
          value: '−${Money.format(discount)}',
          valueColor: context.colors.successText,
        ),
      if (shippingFeeLabel != null) KeyValueRow(label: 'Phí giao hàng', value: shippingFeeLabel!),
      const Divider(),
      KeyValueRow(label: totalLabel, value: Money.format(total), emphasize: true),
    ],
  );
}
