import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/money.dart';
import '../../../../core/utils/vn_time.dart';
import '../../../../core/widgets/widgets.dart';
import '../../domain/entities/payment.dart';

/// Màn kết quả khi thanh toán thành công (khóa học ⇒ xem lịch, sản phẩm ⇒ xem chi tiết thanh toán).
class PaymentSuccessView extends StatelessWidget {
  const PaymentSuccessView({super.key, required this.checkout});

  final Checkout checkout;

  @override
  Widget build(BuildContext context) {
    final c = checkout;
    final col = context.colors;
    final success = context.tones.of(StatusTone.success);
    final isCourse = c.purpose == CheckoutPurpose.course;
    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: EdgeInsets.all(context.screenPadding),
            children: [
              const SizedBox(height: AppSpacing.lg),
              Center(
                child: Container(
                  padding: const EdgeInsets.all(AppSpacing.lg),
                  decoration: BoxDecoration(
                    color: success.background,
                    shape: BoxShape.circle,
                    border: Border.all(color: success.border),
                  ),
                  child: Icon(AppIcons.success, size: AppSpacing.xxl, color: success.foreground),
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              Text('Thanh toán thành công!', textAlign: TextAlign.center, style: context.text.headline),
              const SizedBox(height: AppSpacing.xs),
              Text(
                isCourse
                    ? 'Bạn đã được ghi danh vào ${c.enrolledSessionCount ?? 0} buổi sắp diễn ra của khóa "${c.title}".'
                    : 'Đơn "${c.title}" đã được thanh toán thành công.',
                textAlign: TextAlign.center,
                style: context.text.body.copyWith(color: col.textMuted),
              ),
              const SizedBox(height: AppSpacing.lg),
              AppCard(
                child: Column(
                  children: [
                    KeyValueRow(label: 'Mã đơn', value: c.orderCode),
                    KeyValueRow(label: 'Nội dung', value: c.quantity != null ? '${c.title} × ${c.quantity}' : c.title),
                    if (c.paidAt != null) KeyValueRow(label: 'Thời gian', value: VnTime.dateTime(c.paidAt!)),
                    const Divider(),
                    KeyValueRow(
                      label: 'Số tiền',
                      value: Money.format(c.amount),
                      emphasize: true,
                      valueColor: col.successText,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        StickyBottomBar(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (isCourse) ...[
                AppButton(
                  label: 'Xem lịch tập',
                  icon: AppIcons.schedule,
                  expand: true,
                  onPressed: () => context.go(AppRoutes.memberSchedule),
                ),
                const SizedBox(height: AppSpacing.xs),
                AppButton.outline(
                  label: 'Xem khóa học của tôi',
                  expand: true,
                  onPressed: () => context.pushReplacement(AppRoutes.myCourse(c.classId!)),
                ),
              ] else ...[
                AppButton(
                  label: 'Xem đơn hàng',
                  icon: AppIcons.order,
                  expand: true,
                  onPressed: () => context.pushReplacement(
                    c.productOrderId == null ? AppRoutes.orders : AppRoutes.order(c.productOrderId!),
                  ),
                ),
                if (c.invoiceId != null) ...[
                  const SizedBox(height: AppSpacing.xs),
                  AppButton.outline(
                    label: 'Chi tiết thanh toán',
                    icon: AppIcons.invoice,
                    expand: true,
                    onPressed: () => context.pushReplacement(AppRoutes.invoice(c.invoiceId!)),
                  ),
                ],
              ],
            ],
          ),
        ),
      ],
    );
  }
}
