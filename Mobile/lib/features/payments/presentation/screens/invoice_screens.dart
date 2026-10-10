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

/// I01 — Lịch sử thanh toán (L6: BE đã bỏ hóa đơn — dựng từ `GET /payments/my`).
class InvoicesScreen extends ConsumerWidget {
  const InvoicesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(myInvoicesProvider);
    return AppScaffold(
      title: 'Lịch sử thanh toán',
      body: AsyncValueView(
        value: value,
        onRetry: () => ref.invalidate(myInvoicesProvider),
        isEmpty: (l) => l.isEmpty,
        empty: const EmptyState(
          icon: AppIcons.invoice,
          title: 'Chưa có giao dịch',
          message: 'Các giao dịch mua khóa học, sản phẩm thành công sẽ hiển thị ở đây.',
        ),
        data: (list) => RefreshableList(
          onRefresh: () => ref.refresh(myInvoicesProvider.future),
          itemCount: list.length,
          itemBuilder: (context, i) => _InvoiceCard(invoice: list[i]),
        ),
      ),
    );
  }
}

class _InvoiceCard extends StatelessWidget {
  const _InvoiceCard({required this.invoice});

  final Invoice invoice;

  @override
  Widget build(BuildContext context) => AppCard(
    onTap: () => context.push(AppRoutes.invoice(invoice.id)),
    child: Row(
      children: [
        IconTile(invoice.purpose == CheckoutPurpose.course ? AppIcons.course : AppIcons.order, large: true),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(invoice.itemName, maxLines: 1, overflow: TextOverflow.ellipsis, style: context.text.bodyStrong),
              Text(
                '${invoice.invoiceNumber} · ${VnTime.date(invoice.issuedAt)}',
                style: context.text.caption.copyWith(color: context.colors.textMuted),
              ),
            ],
          ),
        ),
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            MoneyText(invoice.total, style: context.text.label),
            const SizedBox(height: AppSpacing.xxs),
            invoice.status.status.tag(dense: true),
          ],
        ),
      ],
    ),
  );
}

/// I01 — Chi tiết thanh toán (hiển thị trong app, không xuất PDF — Q12).
class InvoiceDetailScreen extends ConsumerWidget {
  const InvoiceDetailScreen({super.key, required this.invoiceId});

  final String invoiceId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(invoiceProvider(invoiceId));
    return AppScaffold(
      title: 'Chi tiết thanh toán',
      body: AsyncValueView(
        value: value,
        loading: const SkeletonDetail(),
        onRetry: () => ref.invalidate(invoiceProvider(invoiceId)),
        data: (inv) => ListView(
          padding: EdgeInsets.all(context.screenPadding),
          children: [
            AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      const BrandLogo(),
                      const SizedBox(width: AppSpacing.xs),
                      Expanded(
                        child: Align(alignment: Alignment.centerRight, child: inv.status.status.tag()),
                      ),
                    ],
                  ),
                  const Divider(height: AppSpacing.xl),
                  Text(
                    'MÃ THANH TOÁN',
                    style: context.text.caption.copyWith(color: context.colors.textMuted, letterSpacing: 1.5),
                  ),
                  Text(inv.invoiceNumber, style: context.text.title),
                  const SizedBox(height: AppSpacing.md),
                  KeyValueRow(label: 'Ngày thanh toán', value: VnTime.dateTime(inv.issuedAt)),
                  if (inv.memberName != null) KeyValueRow(label: 'Khách hàng', value: inv.memberName!),
                  KeyValueRow(label: 'Phương thức', value: inv.paymentMethod.label),
                  if (inv.transactionCode != null) KeyValueRow(label: 'Mã giao dịch', value: inv.transactionCode!),
                  const Divider(height: AppSpacing.xl),
                  Text(
                    inv.purpose == CheckoutPurpose.course ? 'Khóa học' : 'Sản phẩm',
                    style: context.text.caption.copyWith(color: context.colors.textMuted),
                  ),
                  if (inv.lines.length > 1)
                    // L7: đơn nhiều sản phẩm ⇒ hiển thị từng dòng.
                    for (final line in inv.lines)
                      KeyValueRow(label: '${line.name} × ${line.quantity}', value: Money.format(line.total))
                  else
                    Text(
                      inv.quantity != null ? '${inv.itemName} × ${inv.quantity}' : inv.itemName,
                      style: context.text.bodyStrong,
                    ),
                  const SizedBox(height: AppSpacing.md),
                  KeyValueRow(label: 'Tạm tính', value: Money.format(inv.subtotal)),
                  KeyValueRow(label: 'Giảm giá', value: Money.format(inv.discount)),
                  const Divider(),
                  KeyValueRow(label: 'Tổng cộng', value: Money.format(inv.total), emphasize: true),
                  if (inv.refundedAmount > 0) KeyValueRow(label: 'Đã hoàn', value: Money.format(inv.refundedAmount)),
                ],
              ),
            ),
            if (inv.status == InvoiceStatus.cancelled) ...[
              const SizedBox(height: AppSpacing.md),
              const AlertBanner.info(message: 'Giao dịch đã được hoàn tiền.'),
            ],
          ],
        ),
      ),
    );
  }
}
