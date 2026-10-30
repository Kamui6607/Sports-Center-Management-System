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
import '../widgets/invoice_breakdown.dart';

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

class _Party extends StatelessWidget {
  const _Party({required this.title, required this.party});

  final String title;
  final InvoiceParty party;

  @override
  Widget build(BuildContext context) {
    final muted = context.text.caption.copyWith(color: context.colors.textMuted);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: muted.copyWith(letterSpacing: 1.5)),
        Text(party.name, style: context.text.bodyStrong),
        if (party.address != null && party.address!.isNotEmpty) Text(party.address!, style: muted),
        if ([party.phone, party.email].any((v) => v != null && v.isNotEmpty))
          Text([party.phone, party.email].where((v) => v != null && v.isNotEmpty).join(' · '), style: muted),
      ],
    );
  }
}

/// "Tạm tính 300.000 ₫ + ship 30.000 ₫" / "Giá 600.000 ₫ − giảm 200.000 ₫" — cách ra tổng tiền ngay trên thẻ.
String _costLine(Invoice i) {
  final parts = <String>[
    if (i.lines.length > 1) '${i.lines.length} sản phẩm',
    if (i.lines.length == 1 && i.purpose == CheckoutPurpose.product)
      'Đơn giá ${Money.format(i.lines.first.unitPrice)} × ${i.lines.first.quantity}',
    'Tạm tính ${Money.format(i.subtotal)}',
    if (i.discount > 0) 'giảm ${Money.format(i.discount)}',
    if (i.purpose == CheckoutPurpose.product)
      i.isPickup ? 'nhận tại quầy' : (i.shippingFee == 0 ? 'miễn phí ship' : 'ship ${Money.format(i.shippingFee)}'),
    if (i.refundedAmount > 0) 'đã hoàn ${Money.format(i.refundedAmount)}',
  ];
  return parts.join(' · ');
}

class _InvoiceCard extends StatelessWidget {
  const _InvoiceCard({required this.invoice});

  final Invoice invoice;

  @override
  Widget build(BuildContext context) => AppCard(
    onTap: () => context.push(AppRoutes.invoice(invoice.id)),
    child: Row(
      children: [
        IconTile(invoice.purpose.icon, large: true),
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
              Text(
                _costLine(invoice),
                style: context.text.caption.copyWith(color: context.colors.textMuted, fontFeatures: kTabularFigures),
              ),
            ],
          ),
        ),
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            MoneyText(invoice.total, style: context.text.label),
            const SizedBox(height: AppSpacing.xxs),
            if (invoice.isCancelled)
              const StatusTag(label: 'Đã hủy', tone: StatusTone.danger, dense: true)
            else if (invoice.isRefunded)
              const StatusTag(label: 'Đã hoàn tiền', tone: StatusTone.danger, dense: true)
            else if (invoice.isPartiallyRefunded)
              const StatusTag(label: 'Hoàn 1 phần', tone: StatusTone.warning, dense: true)
            else
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
      title: 'Hóa đơn',
      body: AsyncValueView(
        value: value,
        loading: const SkeletonDetail(),
        onRetry: () => ref.invalidate(invoiceProvider(invoiceId)),
        data: (inv) {
          final isCancelled = inv.isCancelled;
          final isRefunded = inv.isRefunded;
          final isPartiallyRefunded = inv.isPartiallyRefunded;

          return ListView(
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
                          child: Align(
                            alignment: Alignment.centerRight,
                            child: isCancelled
                                ? const StatusTag(label: 'ĐÃ HỦY', tone: StatusTone.danger)
                                : isRefunded
                                ? const StatusTag(label: 'ĐÃ HOÀN TIỀN', tone: StatusTone.danger)
                                : isPartiallyRefunded
                                ? StatusTag(label: 'HOÀN ${Money.format(inv.refundedAmount)}', tone: StatusTone.warning)
                                : inv.status.status.tag(),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    Row(
                      children: [
                        Expanded(
                          child: Text('HÓA ĐƠN BÁN HÀNG', style: context.text.titleSmall),
                        ),
                        if (isCancelled || isRefunded || isPartiallyRefunded)
                          Builder(
                            builder: (context) {
                              final tone = context.tones.of(
                                isCancelled || isRefunded ? StatusTone.danger : StatusTone.warning,
                              );
                              return Container(
                                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs, vertical: 2),
                                decoration: BoxDecoration(
                                  color: tone.background,
                                  borderRadius: AppRadius.controlAll,
                                  border: Border.all(color: tone.border, width: 1.5),
                                ),
                                child: Text(
                                  isCancelled
                                      ? 'ĐÃ HỦY'
                                      : isRefunded
                                      ? 'ĐÃ HOÀN TIỀN'
                                      : 'HOÀN 1 PHẦN',
                                  style: context.text.caption.copyWith(
                                    color: tone.foreground,
                                    fontWeight: FontWeight.bold,
                                    letterSpacing: 1,
                                  ),
                                ),
                              );
                            },
                          ),
                      ],
                    ),
                    if (isCancelled) ...[
                      const SizedBox(height: AppSpacing.sm),
                      const AlertBanner.error(
                        title: 'Hóa đơn đã bị hủy',
                        message: 'Giao dịch hoặc đơn hàng này đã bị hủy, không còn hiệu lực thanh toán.',
                      ),
                    ] else if (isRefunded) ...[
                      const SizedBox(height: AppSpacing.sm),
                      AlertBanner.warning(
                        title: 'Hóa đơn đã hoàn tiền',
                        message:
                            'Toàn bộ số tiền ${Money.format(inv.refundedAmount > 0 ? inv.refundedAmount : inv.total)} '
                            'đã được hoàn trả lại cho khách hàng. Thực thu: ${Money.format(inv.netAmount)}.',
                      ),
                    ] else if (isPartiallyRefunded) ...[
                      const SizedBox(height: AppSpacing.sm),
                      AlertBanner.info(
                        title: 'Hóa đơn hoàn một phần',
                        message:
                            'Đã hoàn trả ${Money.format(inv.refundedAmount)}. Số tiền thực thu sau khi hoàn: ${Money.format(inv.netAmount)}.',
                      ),
                    ],
                    const Divider(height: AppSpacing.xl),
                    Text(
                      'SỐ HÓA ĐƠN',
                      style: context.text.caption.copyWith(color: context.colors.textMuted, letterSpacing: 1.5),
                    ),
                    Text(inv.invoiceNumber, style: context.text.title),
                    const SizedBox(height: AppSpacing.md),
                    KeyValueRow(label: 'Trạng thái', value: isCancelled ? 'Đã hủy' : isRefunded ? 'Đã hoàn tiền' : isPartiallyRefunded ? 'Hoàn một phần' : (inv.statusLabel ?? 'Đã thanh toán')),
                    KeyValueRow(label: 'Ngày thanh toán', value: VnTime.dateTime(inv.issuedAt)),
                    KeyValueRow(label: 'Phương thức', value: inv.paymentMethod.label),
                    if (inv.transactionCode != null) KeyValueRow(label: 'Mã giao dịch', value: inv.transactionCode!),
                    if (inv.periodLabel != null)
                      KeyValueRow(
                        label: inv.purpose == CheckoutPurpose.membership ? 'Hiệu lực' : 'Thời gian khóa',
                        value: inv.periodLabel!,
                      ),
                    if (inv.seller != null || inv.buyer != null) ...[
                      const Divider(height: AppSpacing.xl),
                      if (inv.seller != null) _Party(title: 'BÊN BÁN', party: inv.seller!),
                      if (inv.buyer != null) ...[
                        const SizedBox(height: AppSpacing.sm),
                        _Party(title: 'KHÁCH HÀNG', party: inv.buyer!),
                      ],
                    ] else if (inv.memberName != null)
                      KeyValueRow(label: 'Khách hàng', value: inv.memberName!),
                    const Divider(height: AppSpacing.xl),
                    Text(
                      inv.purpose.label.toUpperCase(),
                      style: context.text.caption.copyWith(color: context.colors.textMuted, letterSpacing: 1.5),
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    InvoiceBreakdown(invoice: inv),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                'Giá, tên mặt hàng và thông tin trên hóa đơn được chốt tại thời điểm mua — thay đổi sau này không ảnh hưởng.',
                style: context.text.caption.copyWith(color: context.colors.textMuted),
              ),
              const SizedBox(height: AppSpacing.md),
              if (inv.orderId != null) ...[
                AppButton.secondary(
                  label: 'Xem chi tiết đơn hàng',
                  icon: AppIcons.order,
                  expand: true,
                  onPressed: () => context.push(AppRoutes.order(inv.orderId!)),
                ),
                const SizedBox(height: AppSpacing.xs),
              ],
              AppButton.outline(
                label: 'Xem tất cả lịch sử thanh toán',
                icon: AppIcons.time,
                expand: true,
                onPressed: () => context.push(AppRoutes.invoices),
              ),
            ],
          );
        },
      ),
    );
  }
}
