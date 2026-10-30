import 'package:flutter/material.dart';

import '../../../../core/theme/theme.dart';
import '../../../../core/utils/money.dart';
import '../../../../core/utils/vn_time.dart';
import '../../../../core/widgets/widgets.dart';
import '../../domain/entities/payment.dart';

/// Bảng tính của hóa đơn: từng dòng (đơn giá × số lượng = thành tiền) → tạm tính → giảm → phí giao hàng → tổng,
/// kèm các khoản hoàn và số tiền thực trả. Dùng chung cho màn hóa đơn và màn thanh toán thành công.
class InvoiceBreakdown extends StatelessWidget {
  const InvoiceBreakdown({super.key, required this.invoice, this.showRefunds = true});

  final Invoice invoice;
  final bool showRefunds;

  @override
  Widget build(BuildContext context) {
    final inv = invoice;
    final col = context.colors;
    final muted = context.text.caption.copyWith(color: col.textMuted);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final (i, line) in inv.lines.indexed) ...[
          if (i > 0) const Divider(height: AppSpacing.lg),
          CostLineItem(
            name: line.name,
            description: line.description,
            unit: line.unit,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            total: line.total,
          ),
        ],
        const Divider(height: AppSpacing.xl),
        CostSummary(
          subtotal: inv.subtotal,
          discount: inv.discount,
          discountLabel: inv.discountLabel,
          // Phí giao hàng chỉ áp dụng cho đơn sản phẩm.
          shippingFeeLabel: inv.purpose == CheckoutPurpose.product
              ? CostSummary.shippingLabel(isPickup: inv.isPickup, fee: inv.shippingFee)
              : null,
          total: inv.total,
        ),
        if (showRefunds && inv.refunds.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.md),
          Text('Hoàn tiền', style: muted),
          for (final r in inv.refunds)
            KeyValueRow(
              label: '${r.reasonLabel} · ${r.statusLabel} · ${VnTime.date(r.processedAt ?? r.createdAt)}',
              value: '−${Money.format(r.amount)}',
              valueColor: r.completed ? col.successText : col.textMuted,
            ),
          const Divider(),
          KeyValueRow(label: 'Thực trả sau hoàn', value: Money.format(inv.netAmount), emphasize: true),
          if (inv.pendingRefundAmount > 0)
            KeyValueRow(label: 'Đang chờ hoàn', value: Money.format(inv.pendingRefundAmount)),
        ] else if (inv.refundedAmount > 0)
          KeyValueRow(label: 'Đã hoàn', value: Money.format(inv.refundedAmount)),
      ],
    );
  }
}
