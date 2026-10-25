import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/money.dart';
import '../../../../core/utils/vn_time.dart';
import '../../../../core/widgets/widgets.dart';
import '../../domain/entities/payment.dart';
import '../payment_labels.dart';
import '../providers/payment_providers.dart';
import 'invoice_breakdown.dart';

/// Màn kết quả khi thanh toán thành công (khóa học ⇒ xem lịch, sản phẩm ⇒ xem chi tiết thanh toán).
class PaymentSuccessView extends ConsumerWidget {
  const PaymentSuccessView({super.key, required this.checkout});

  final Checkout checkout;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = checkout;
    // Hóa đơn chi tiết (đơn giá, giảm, phí ship…) — chưa tải được thì vẫn hiện tóm tắt số tiền.
    final invoice = ref.watch(invoiceProvider(c.paymentId)).value;
    final col = context.colors;
    final success = context.tones.of(StatusTone.success);
    final isCourse = c.purpose == CheckoutPurpose.course;
    final isMembership = c.purpose == CheckoutPurpose.membership;
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
                    : isMembership
                    ? '"${c.title}" đã được kích hoạt. Đưa mã QR thẻ thành viên khi vào phòng tập.'
                    : 'Đơn "${c.title}" đã được thanh toán thành công.',
                textAlign: TextAlign.center,
                style: context.text.body.copyWith(color: col.textMuted),
              ),
              const SizedBox(height: AppSpacing.lg),
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    KeyValueRow(
                      label: invoice == null ? 'Mã đơn' : 'Số hóa đơn',
                      value: invoice?.invoiceNumber ?? c.orderCode,
                    ),
                    if (c.paidAt != null) KeyValueRow(label: 'Thời gian', value: VnTime.dateTime(c.paidAt!)),
                    KeyValueRow(label: 'Phương thức', value: (invoice?.paymentMethod ?? PaymentMethod.sepay).label),
                    if (invoice?.transactionCode != null)
                      KeyValueRow(label: 'Mã giao dịch', value: invoice!.transactionCode!),
                    if (invoice?.periodLabel != null)
                      KeyValueRow(label: isMembership ? 'Hiệu lực' : 'Thời gian khóa', value: invoice!.periodLabel!),
                    const Divider(height: AppSpacing.lg),
                    if (invoice != null)
                      InvoiceBreakdown(invoice: invoice, showRefunds: false)
                    else ...[
                      KeyValueRow(
                        label: 'Nội dung',
                        value: c.quantity != null ? '${c.title} × ${c.quantity}' : c.title,
                      ),
                      const Divider(),
                      KeyValueRow(
                        label: 'Số tiền',
                        value: Money.format(c.amount),
                        emphasize: true,
                        valueColor: col.successText,
                      ),
                    ],
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
                const SizedBox(height: AppSpacing.xs),
                AppButton.ghost(
                  label: 'Xem hóa đơn',
                  icon: AppIcons.invoice,
                  expand: true,
                  onPressed: () => context.pushReplacement(AppRoutes.invoice(c.paymentId)),
                ),
              ] else if (isMembership) ...[
                AppButton(
                  label: 'Xem thẻ thành viên',
                  icon: AppIcons.membership,
                  expand: true,
                  onPressed: () => context.pushReplacement(AppRoutes.membershipCard),
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
