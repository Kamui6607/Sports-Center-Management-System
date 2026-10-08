import 'package:flutter/material.dart';

import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/widgets/widgets.dart';
import '../../domain/entities/payment.dart';
import '../payment_labels.dart';

/// Đầu màn thanh toán: đơn gì, bao nhiêu tiền, trạng thái — và thời hạn giữ mã
/// (thông tin gấp nhất) ngay dưới số tiền khi giao dịch còn mở.
class PaymentSummaryCard extends StatelessWidget {
  const PaymentSummaryCard({super.key, required this.checkout, required this.now, this.onExpired});

  final Checkout checkout;
  final DateTime now;

  /// Gọi khi đồng hồ về 0 (làm mới trạng thái).
  final VoidCallback? onExpired;

  @override
  Widget build(BuildContext context) {
    final c = checkout;
    final col = context.colors;
    final open = c.status == PaymentStatus.pending && !c.isExpired(now);
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  c.quantity != null ? '${c.title} × ${c.quantity}' : c.title,
                  style: context.text.titleSmall,
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              checkoutStatus(c, now).tag(),
            ],
          ),
          const SizedBox(height: AppSpacing.xxs),
          Text(
            '${c.purpose == CheckoutPurpose.course ? 'Khóa học' : 'Đơn sản phẩm'} · Mã đơn ${c.orderCode}',
            style: context.text.caption.copyWith(color: col.textMuted),
          ),
          const SizedBox(height: AppSpacing.md),
          MoneyText(c.amount, style: context.text.display.copyWith(color: col.primary)),
          if (open) ...[
            const SizedBox(height: AppSpacing.md),
            _ExpiryStrip(deadline: c.expiresAt, onExpired: onExpired),
          ],
        ],
      ),
    );
  }
}

class _ExpiryStrip extends StatelessWidget {
  const _ExpiryStrip({required this.deadline, this.onExpired});

  final DateTime deadline;
  final VoidCallback? onExpired;

  @override
  Widget build(BuildContext context) {
    final tone = context.tones.of(StatusTone.warning);
    final fg = context.colors.warningText;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: AppSpacing.xs),
      decoration: BoxDecoration(
        color: tone.background,
        borderRadius: AppRadius.controlAll,
        border: Border.all(color: tone.border),
      ),
      child: Row(
        children: [
          Icon(AppIcons.time, size: AppSizes.iconSm, color: fg),
          const SizedBox(width: AppSpacing.xs),
          Expanded(
            child: Text('Mã hết hạn sau', style: context.text.small.copyWith(color: fg)),
          ),
          CountdownText(
            deadline: deadline,
            style: context.text.titleSmall.copyWith(color: fg, fontFeatures: kTabularFigures),
            onExpired: onExpired,
          ),
        ],
      ),
    );
  }
}
