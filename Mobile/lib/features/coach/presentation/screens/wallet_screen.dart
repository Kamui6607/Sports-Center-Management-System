import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../app/shell/header_actions.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/vn_time.dart';
import '../../../../core/widgets/widgets.dart';
import '../../domain/entities/wallet.dart';
import '../providers/coach_providers.dart';
import '../wallet_labels.dart';

/// H12 — Ví HLV: số dư, tiền tạm giữ, số dư khả dụng, điều kiện rút (Q10), lịch sử.
class WalletScreen extends ConsumerStatefulWidget {
  const WalletScreen({super.key});

  @override
  ConsumerState<WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends ConsumerState<WalletScreen> {
  WalletTxType? _filter;

  @override
  Widget build(BuildContext context) {
    final wallet = ref.watch(coachWalletProvider);
    final txs = ref.watch(walletTransactionsProvider).value ?? const <WalletTransaction>[];
    final filtered = txs.where((t) => _filter == null || t.type == _filter).toList();
    return AppScaffold(
      title: 'Ví HLV',
      actions: const [HeaderActions()],
      body: AsyncValueView(
        value: wallet,
        loading: const SkeletonDetail(),
        onRetry: () => ref.invalidate(coachWalletProvider),
        data: (w) => RefreshableScroll(
          onRefresh: () async {
            ref.invalidate(walletTransactionsProvider);
            ref.invalidate(coachWalletProvider);
            await ref.read(coachWalletProvider.future);
          },
          children: [
            _BalanceCard(wallet: w),
            const SizedBox(height: AppSpacing.md),
            _Eligibility(wallet: w),
            const SizedBox(height: AppSpacing.lg),
            const SectionHeader(title: 'Lịch sử giao dịch'),
            ChipBar(
              padding: EdgeInsets.zero,
              children: [
                AppChip(label: 'Tất cả', selected: _filter == null, onTap: () => setState(() => _filter = null)),
                for (final t in WalletTxType.values)
                  AppChip(label: t.label, selected: _filter == t, onTap: () => setState(() => _filter = t)),
              ],
            ),
            const SizedBox(height: AppSpacing.sm),
            if (filtered.isEmpty)
              const EmptyState(compact: true, icon: AppIcons.wallet, title: 'Chưa có giao dịch')
            else
              AppCard(
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
                child: Column(
                  children: [
                    for (var i = 0; i < filtered.length; i++) ...[
                      if (i > 0) const Divider(),
                      WalletTxTile(tx: filtered[i]),
                    ],
                  ],
                ),
              ),
            const SizedBox(height: AppSpacing.xl),
          ],
        ),
      ),
    );
  }
}

class _BalanceCard extends StatelessWidget {
  const _BalanceCard({required this.wallet});

  final CoachWallet wallet;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(color: c.primary, borderRadius: AppRadius.sheetAll, boxShadow: AppShadows.raised),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('SỐ DƯ KHẢ DỤNG', style: context.text.caption.copyWith(color: c.accent, letterSpacing: 1)),
          MoneyText(wallet.available, style: context.text.display.copyWith(color: c.onPrimary)),
          const SizedBox(height: AppSpacing.md),
          Row(
            children: [
              Expanded(child: _mini(context, 'Số dư ví', wallet.balance)),
              Expanded(child: _mini(context, 'Đang tạm giữ', wallet.pendingRefundHold)),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          AppButton.secondary(
            label: 'Rút tiền',
            icon: AppIcons.bank,
            expand: true,
            onPressed: wallet.canWithdraw ? () => context.push(AppRoutes.withdraw) : null,
          ),
        ],
      ),
    );
  }

  Widget _mini(BuildContext context, String label, int amount) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(label, style: context.text.caption.copyWith(color: context.colors.onPrimary.withValues(alpha: 0.75))),
      MoneyText(amount, style: context.text.bodyStrong.copyWith(color: context.colors.onPrimary)),
    ],
  );
}

/// Điều kiện rút tiền — hiển thị đúng danh sách do repository/BE trả về.
class _Eligibility extends StatelessWidget {
  const _Eligibility({required this.wallet});

  final CoachWallet wallet;

  @override
  Widget build(BuildContext context) {
    final success = context.tones.of(StatusTone.success).foreground;
    final danger = context.tones.of(StatusTone.danger).foreground;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(child: Text('Điều kiện rút tiền', style: context.text.label)),
              (wallet.canWithdraw
                      ? const StatusLabel('Đủ điều kiện', StatusTone.success)
                      : const StatusLabel('Chưa đủ điều kiện', StatusTone.warning))
                  .tag(dense: true),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          for (final check in wallet.checks)
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.xs),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    check.passed ? AppIcons.success : AppIcons.error,
                    size: AppSizes.icon,
                    color: check.passed ? success : danger,
                  ),
                  const SizedBox(width: AppSpacing.xs),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(check.label, style: context.text.small),
                        if (check.detail != null)
                          Text(check.detail!, style: context.text.caption.copyWith(color: context.colors.textMuted)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// Một giao dịch ví.
class WalletTxTile extends StatelessWidget {
  const WalletTxTile({super.key, required this.tx, this.onTap});

  final WalletTransaction tx;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final icon = switch (tx.type) {
      WalletTxType.deposit => AppIcons.trend,
      WalletTxType.withdrawal => AppIcons.bank,
      WalletTxType.refundDebit => AppIcons.refund,
    };
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
        child: Row(
          children: [
            Icon(icon, color: tx.type == WalletTxType.deposit ? c.successText : c.textMuted),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(tx.type.label, style: context.text.label),
                  Text(
                    [tx.className ?? tx.note, VnTime.dateTime(tx.createdAt)].whereType<String>().join(' · '),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: context.text.caption.copyWith(color: c.textMuted),
                  ),
                  if (tx.rejectReason != null)
                    Text(
                      'Lý do: ${tx.rejectReason}',
                      style: context.text.caption.copyWith(color: context.tones.of(StatusTone.danger).foreground),
                    ),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                MoneyText(tx.signedAmount, signed: true, style: context.text.label),
                if (tx.status != WalletTxStatus.completed) tx.status.status.tag(dense: true),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
