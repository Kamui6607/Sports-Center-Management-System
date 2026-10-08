import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_routes.dart';
import '../../../app/shell/header_actions.dart';
import '../../../core/icons/app_icons.dart';
import '../../../core/theme/theme.dart';
import '../../../core/utils/money.dart';
import '../../../core/utils/vn_time.dart';
import '../../../core/widgets/widgets.dart';
import '../../classes/presentation/screens/coach_classes_screen.dart';
import '../../coach/domain/entities/wallet.dart';
import '../../coach/presentation/wallet_labels.dart';
import '../../refunds/domain/entities/refund.dart';
import '../../refunds/presentation/providers/refund_providers.dart';
import '../../refunds/presentation/screens/refund_screens.dart';
import 'manager_providers.dart';

/// R02–R05 — Danh sách chờ duyệt: CV · Khóa học · Rút tiền · Hoàn tiền.
class ApprovalsScreen extends ConsumerStatefulWidget {
  const ApprovalsScreen({super.key, this.initialTab = 0});

  final int initialTab;

  @override
  ConsumerState<ApprovalsScreen> createState() => _ApprovalsScreenState();
}

class _ApprovalsScreenState extends ConsumerState<ApprovalsScreen> {
  late int _tab = widget.initialTab;
  bool _pendingOnly = true;

  @override
  void didUpdateWidget(covariant ApprovalsScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.initialTab != widget.initialTab) _tab = widget.initialTab;
  }

  @override
  Widget build(BuildContext context) {
    final counts = ref.watch(approvalCountsProvider).value;
    return AppScaffold(
      title: 'Duyệt',
      actions: const [HeaderActions(showChat: false)],
      body: Column(
        children: [
          const SizedBox(height: AppSpacing.sm),
          SegmentedTabs<int>(
            selected: _tab,
            onChanged: (v) => setState(() => _tab = v),
            options: [
              SegmentOption(0, 'Hồ sơ HLV', count: counts?.cvs ?? 0),
              SegmentOption(1, 'Khóa học', count: counts?.classes ?? 0),
              SegmentOption(2, 'Rút tiền', count: counts?.withdrawals ?? 0),
              SegmentOption(3, 'Hoàn tiền', count: counts?.refunds ?? 0),
            ],
          ),
          if (_tab >= 2)
            Padding(
              padding: EdgeInsets.fromLTRB(context.screenPadding, AppSpacing.xs, context.screenPadding, 0),
              child: Row(
                children: [
                  AppChip(label: 'Chờ duyệt', selected: _pendingOnly, onTap: () => setState(() => _pendingOnly = true)),
                  const SizedBox(width: AppSpacing.xs),
                  AppChip(label: 'Tất cả', selected: !_pendingOnly, onTap: () => setState(() => _pendingOnly = false)),
                ],
              ),
            ),
          Expanded(
            child: switch (_tab) {
              0 => const _CvList(),
              1 => const _ClassList(),
              2 => _WithdrawalList(status: _pendingOnly ? WalletTxStatus.pending : null),
              _ => _RefundList(status: _pendingOnly ? RefundStatus.pending : null),
            },
          ),
        ],
      ),
    );
  }
}

class _CvList extends ConsumerWidget {
  const _CvList();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(pendingCvsProvider);
    return AsyncValueView(
      value: value,
      onRetry: () => ref.invalidate(pendingCvsProvider),
      isEmpty: (l) => l.isEmpty,
      empty: const EmptyState(icon: AppIcons.cv, title: 'Không có hồ sơ HLV chờ duyệt'),
      data: (list) => RefreshableList(
        onRefresh: () => ref.refresh(pendingCvsProvider.future),
        itemCount: list.length,
        itemBuilder: (context, i) {
          final cv = list[i];
          return AppCard(
            onTap: () => context.push(AppRoutes.reviewCv(cv.coachProfileId)),
            child: Row(
              children: [
                AppAvatar(name: cv.fullName),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(cv.fullName, style: context.text.bodyStrong),
                      Text(
                        '${cv.specialization ?? 'Chưa ghi chuyên môn'} · nộp ${VnTime.relative(cv.certification.submittedAt, DateTime.now())}',
                        style: context.text.caption.copyWith(color: context.colors.textMuted),
                      ),
                    ],
                  ),
                ),
                Icon(AppIcons.chevronRight, color: context.colors.textMuted),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _ClassList extends ConsumerWidget {
  const _ClassList();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(pendingClassesProvider);
    return AsyncValueView(
      value: value,
      onRetry: () => ref.invalidate(pendingClassesProvider),
      isEmpty: (l) => l.isEmpty,
      empty: const EmptyState(icon: AppIcons.course, title: 'Không có khóa học chờ duyệt'),
      data: (list) => RefreshableList(
        onRefresh: () => ref.refresh(pendingClassesProvider.future),
        itemCount: list.length,
        itemBuilder: (context, i) =>
            CoachClassCard(course: list[i], onTap: () => context.push(AppRoutes.reviewClass(list[i].id))),
      ),
    );
  }
}

class _WithdrawalList extends ConsumerWidget {
  const _WithdrawalList({required this.status});

  final WalletTxStatus? status;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(withdrawalsProvider(status));
    return AsyncValueView(
      value: value,
      onRetry: () => ref.invalidate(withdrawalsProvider(status)),
      isEmpty: (l) => l.isEmpty,
      empty: const EmptyState(icon: AppIcons.bank, title: 'Không có lệnh rút tiền'),
      data: (list) => RefreshableList(
        onRefresh: () => ref.refresh(withdrawalsProvider(status).future),
        itemCount: list.length,
        itemBuilder: (context, i) {
          final w = list[i];
          return AppCard(
            onTap: () => context.push(AppRoutes.reviewWithdrawal(w.transaction.id)),
            child: Row(
              children: [
                AppAvatar(name: w.coachName),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(w.coachName, style: context.text.bodyStrong),
                      Text(
                        VnTime.dateTime(w.transaction.createdAt),
                        style: context.text.caption.copyWith(color: context.colors.textMuted),
                      ),
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(Money.format(w.transaction.amount), style: context.text.label),
                    w.transaction.status.status.tag(dense: true),
                  ],
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _RefundList extends ConsumerWidget {
  const _RefundList({required this.status});

  final RefundStatus? status;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(managerRefundsProvider(status));
    return AsyncValueView(
      value: value,
      onRetry: () => ref.invalidate(managerRefundsProvider(status)),
      isEmpty: (l) => l.isEmpty,
      empty: const EmptyState(icon: AppIcons.refund, title: 'Không có yêu cầu hoàn tiền'),
      data: (list) => RefreshableList(
        onRefresh: () => ref.refresh(managerRefundsProvider(status).future),
        itemCount: list.length,
        itemBuilder: (context, i) => RefundCard(
          refund: list[i],
          showMember: true,
          onTap: () => context.push(AppRoutes.reviewRefund(list[i].id)),
        ),
      ),
    );
  }
}
