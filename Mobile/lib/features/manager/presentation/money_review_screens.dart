import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/icons/app_icons.dart';

import '../../../core/theme/theme.dart';
import '../../../core/utils/money.dart';
import '../../../core/utils/vn_time.dart';
import '../../../core/widgets/widgets.dart';
import '../../coach/domain/entities/wallet.dart';
import '../../coach/presentation/wallet_labels.dart';
import '../../refunds/data/refund_repository_provider.dart';
import '../../refunds/domain/entities/refund.dart';
import '../../refunds/presentation/providers/refund_providers.dart';
import '../../refunds/presentation/refund_labels.dart';
import '../../refunds/presentation/screens/refund_screens.dart';
import '../data/manager_repository_provider.dart';
import 'manager_providers.dart';
import 'review_action_bar.dart';

/// R04 — Duyệt lệnh rút tiền (chuyển khoản tay rồi duyệt).
class WithdrawalReviewScreen extends ConsumerWidget {
  const WithdrawalReviewScreen({super.key, required this.transactionId});

  final String transactionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(withdrawalProvider(transactionId));
    final w = value.value;
    final repo = ref.read(managerRepositoryProvider);
    return AppScaffold(
      title: 'Lệnh rút tiền',
      bottomBar: w == null || w.transaction.status != WalletTxStatus.pending
          ? null
          : ReviewActionBar(
              approveLabel: 'Đã chuyển khoản',
              approveMessage:
                  'Xác nhận đã chuyển ${Money.format(w.transaction.amount)} tới ${w.transaction.bankInfo?.bankName} '
                  '${w.transaction.bankInfo?.accountNumber}. Ví HLV sẽ bị trừ tương ứng.',
              onApprove: (_) => runReview(
                context,
                ref,
                () => repo.reviewWithdrawal(transactionId, approve: true),
                'Đã duyệt lệnh rút tiền.',
              ),
              onReject: (reason) => runReview(
                context,
                ref,
                () => repo.reviewWithdrawal(transactionId, approve: false, reason: reason),
                'Đã từ chối lệnh rút tiền.',
              ),
            ),
      body: AsyncValueView(
        value: value,
        loading: const SkeletonDetail(),
        onRetry: () => ref.invalidate(withdrawalProvider(transactionId)),
        data: (w) {
          final t = w.transaction;
          final bank = t.bankInfo;
          return ListView(
            padding: EdgeInsets.all(context.screenPadding),
            children: [
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(child: Text(w.coachName, style: context.text.titleSmall)),
                        t.status.status.tag(),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    MoneyText(t.amount, style: context.text.display.copyWith(color: context.colors.primary)),
                    Text('Yêu cầu lúc ${VnTime.dateTime(t.createdAt)}', style: context.text.caption),
                    if (t.rejectReason != null) ...[
                      const SizedBox(height: AppSpacing.sm),
                      AlertBanner.error(message: 'Lý do từ chối: ${t.rejectReason}'),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              if (bank != null)
                AppCard(
                  child: Column(
                    children: [
                      CopyableField(label: 'Ngân hàng', value: bank.bankName),
                      const Divider(),
                      CopyableField(label: 'Số tài khoản', value: bank.accountNumber, emphasize: true),
                      const Divider(),
                      CopyableField(label: 'Chủ tài khoản', value: bank.accountName),
                      const Divider(),
                      CopyableField(
                        label: 'Số tiền',
                        value: Money.format(t.amount),
                        copyValue: '${t.amount}',
                        emphasize: true,
                      ),
                    ],
                  ),
                ),
              const SizedBox(height: AppSpacing.md),
              AppCard(
                child: Column(
                  children: [
                    KeyValueRow(label: 'Số dư ví HLV', value: Money.format(w.walletBalance)),
                    KeyValueRow(label: 'Đang tạm giữ (hoàn tiền)', value: Money.format(w.pendingRefundHold)),
                    if (t.status == WalletTxStatus.pending)
                      KeyValueRow(
                        label: 'Số dư sau khi duyệt',
                        value: Money.format(w.walletBalance - t.amount),
                        emphasize: true,
                      ),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

/// R05 — Duyệt yêu cầu hoàn tiền (chuyển khoản tay cho học viên rồi duyệt).
class RefundReviewScreen extends ConsumerWidget {
  const RefundReviewScreen({super.key, required this.refundId});

  final String refundId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(refundProvider(refundId));
    final r = value.value;
    final repo = ref.read(refundRepositoryProvider);
    return AppScaffold(
      title: 'Yêu cầu hoàn tiền',
      bottomBar: r == null || r.status != RefundStatus.pending
          ? null
          : ReviewActionBar(
              approveLabel: 'Đã hoàn tiền',
              approveMessage: r.isOrder
                  ? 'Xác nhận đã chuyển ${Money.format(r.amount)} cho ${r.memberName}. Đơn hàng chuyển sang "Đã hoàn tiền".'
                  : 'Xác nhận đã chuyển ${Money.format(r.amount)} cho ${r.memberName}. Ví HLV ${r.coachName} bị trừ '
                        '${Money.format(r.coachDebitAmount)}.',
              approveNoteLabel: 'Ghi chú (VD mã giao dịch chuyển khoản)',
              onApprove: (note) =>
                  runReview(context, ref, () => repo.approve(refundId, note: note), 'Đã duyệt hoàn tiền.'),
              onReject: (reason) => runReview(context, ref, () => repo.reject(refundId, reason), 'Đã từ chối yêu cầu.'),
            ),
      body: AsyncValueView(
        value: value,
        loading: const SkeletonDetail(),
        onRetry: () => ref.invalidate(refundProvider(refundId)),
        data: (r) => ListView(
          padding: EdgeInsets.all(context.screenPadding),
          children: [
            RefundCard(refund: r, showMember: true),
            const SizedBox(height: AppSpacing.md),
            AppCard(
              child: Column(
                children: [
                  KeyValueRow(label: r.isOrder ? 'Người mua' : 'Học viên', value: r.memberName),
                  if (r.isOrder)
                    KeyValueRow(label: 'Đơn hàng', value: r.orderCode ?? '')
                  else ...[
                    KeyValueRow(label: 'Khóa học', value: r.className),
                    KeyValueRow(label: 'HLV', value: r.coachName),
                  ],
                  KeyValueRow(label: 'Lý do', value: r.reason.label),
                  if (r.sessionStart != null)
                    KeyValueRow(label: 'Buổi bị hủy', value: VnTime.dateTime(r.sessionStart!)),
                  if (r.paidAmount != null) KeyValueRow(label: 'Giao dịch gốc', value: Money.format(r.paidAmount!)),
                  const Divider(),
                  KeyValueRow(
                    label: r.isOrder ? 'Hoàn cho người mua' : 'Hoàn cho học viên',
                    value: Money.format(r.amount),
                    emphasize: true,
                  ),
                  if (!r.isOrder) KeyValueRow(label: 'Trừ ví HLV (85%)', value: Money.format(r.coachDebitAmount)),
                ],
              ),
            ),
            if (r.note != null) ...[
              const SizedBox(height: AppSpacing.md),
              AlertBanner.info(title: r.isOrder ? 'Ghi chú' : 'Ghi chú của học viên', message: r.note!),
            ],
            if (r.orderId != null) ...[
              const SizedBox(height: AppSpacing.md),
              AppButton.outline(
                label: 'Xem đơn hàng',
                icon: AppIcons.order,
                expand: true,
                onPressed: () => context.push(AppRoutes.managerOrder(r.orderId!)),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
