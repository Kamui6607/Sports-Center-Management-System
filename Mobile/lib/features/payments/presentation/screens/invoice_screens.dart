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

/// I01 — Danh sách hóa đơn.
class InvoicesScreen extends ConsumerWidget {
  const InvoicesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(myInvoicesProvider);
    return AppScaffold(
      title: 'Hóa đơn',
      body: AsyncValueView(
        value: value,
        onRetry: () => ref.invalidate(myInvoicesProvider),
        isEmpty: (l) => l.isEmpty,
        empty: const EmptyState(
          icon: AppIcons.invoice,
          title: 'Chưa có hóa đơn',
          message: 'Hóa đơn được xuất tự động sau mỗi giao dịch thành công.',
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

/// I01 — Chi tiết hóa đơn (hiển thị trong app, không xuất PDF — Q12).
class InvoiceDetailScreen extends ConsumerWidget {
  const InvoiceDetailScreen({super.key, required this.invoiceId});

  final String invoiceId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(invoiceProvider(invoiceId));
    return AppScaffold(
      title: 'Chi tiết hóa đơn',
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
                  Row(children: [const BrandLogo(), const Spacer(), inv.status.status.tag()]),
                  const Divider(height: AppSpacing.xl),
                  Text(
                    'HÓA ĐƠN',
                    style: context.text.caption.copyWith(color: context.colors.textMuted, letterSpacing: 1.5),
                  ),
                  Text(inv.invoiceNumber, style: context.text.title),
                  const SizedBox(height: AppSpacing.md),
                  KeyValueRow(label: 'Ngày xuất', value: VnTime.dateTime(inv.issuedAt)),
                  if (inv.memberName != null) KeyValueRow(label: 'Khách hàng', value: inv.memberName!),
                  KeyValueRow(label: 'Phương thức', value: inv.paymentMethod.label),
                  if (inv.transactionCode != null) KeyValueRow(label: 'Mã giao dịch', value: inv.transactionCode!),
                  const Divider(height: AppSpacing.xl),
                  Text(
                    inv.purpose == CheckoutPurpose.course ? 'Khóa học' : 'Sản phẩm',
                    style: context.text.caption.copyWith(color: context.colors.textMuted),
                  ),
                  Text(
                    inv.quantity != null ? '${inv.itemName} × ${inv.quantity}' : inv.itemName,
                    style: context.text.bodyStrong,
                  ),
                  const SizedBox(height: AppSpacing.md),
                  KeyValueRow(label: 'Tạm tính', value: Money.format(inv.subtotal)),
                  KeyValueRow(label: 'Giảm giá', value: Money.format(inv.discount)),
                  const Divider(),
                  KeyValueRow(label: 'Tổng cộng', value: Money.format(inv.total), emphasize: true),
                ],
              ),
            ),
            if (inv.status == InvoiceStatus.cancelled) ...[
              const SizedBox(height: AppSpacing.md),
              const AlertBanner.warning(message: 'Hóa đơn đã bị hủy do giao dịch được hoàn tiền.'),
            ],
          ],
        ),
      ),
    );
  }
}
