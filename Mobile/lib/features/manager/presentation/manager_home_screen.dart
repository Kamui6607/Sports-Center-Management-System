import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_routes.dart';
import '../../../app/shell/header_actions.dart';
import '../../../core/icons/app_icons.dart';
import '../../../core/theme/theme.dart';
import '../../../core/utils/vn_time.dart';
import '../../../core/widgets/widgets.dart';
import '../../auth/presentation/providers/session_provider.dart';
import 'manager_providers.dart';

/// R01 — Tổng quan Quản lý: số việc chờ duyệt theo loại.
class ManagerHomeScreen extends ConsumerWidget {
  const ManagerHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final counts = ref.watch(approvalCountsProvider);
    final user = ref.watch(currentUserProvider);
    final now = DateTime.now();
    void open(int tab) => context.go('${AppRoutes.managerApprovals}?tab=$tab');
    return AppScaffold(
      titleWidget: const BrandLogo(),
      actions: const [HeaderActions(showChat: false)],
      body: AsyncValueView(
        value: counts,
        loading: const SkeletonDetail(),
        onRetry: () => ref.invalidate(approvalCountsProvider),
        data: (c) => RefreshableScroll(
          onRefresh: () => ref.refresh(approvalCountsProvider.future),
          children: [
            Text('Chào ${user?.firstName ?? ''}!', style: context.text.headline),
            Text(
              '${VnTime.weekdayOf(now)}, ${VnTime.date(now)} · Bản rút gọn cho Quản lý',
              style: context.text.small.copyWith(color: context.colors.textMuted),
            ),
            const SizedBox(height: AppSpacing.md),
            if (c.total == 0)
              const AlertBanner.success(message: 'Không còn việc nào chờ duyệt.')
            else
              AlertBanner.warning(title: '${c.total} việc đang chờ bạn', message: 'Chạm vào từng mục để xem và xử lý.'),
            const SizedBox(height: AppSpacing.md),
            KpiGrid(
              children: [
                KpiTile(
                  icon: AppIcons.cv,
                  label: 'Hồ sơ HLV chờ duyệt',
                  value: '${c.cvs}',
                  onTap: () => open(0),
                  highlight: c.cvs > 0,
                ),
                KpiTile(
                  icon: AppIcons.course,
                  label: 'Khóa học chờ duyệt',
                  value: '${c.classes}',
                  onTap: () => open(1),
                  highlight: c.classes > 0,
                ),
                KpiTile(
                  icon: AppIcons.bank,
                  label: 'Lệnh rút tiền',
                  value: '${c.withdrawals}',
                  onTap: () => open(2),
                  highlight: c.withdrawals > 0,
                ),
                KpiTile(
                  icon: AppIcons.refund,
                  label: 'Yêu cầu hoàn tiền',
                  value: '${c.refunds}',
                  onTap: () => open(3),
                  highlight: c.refunds > 0,
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.lg),
            const AlertBanner.info(
              title: 'Quy trình tiền',
              message:
                  'Rút tiền / hoàn tiền: chuyển khoản thủ công ngoài hệ thống trước, sau đó bấm "Duyệt". '
                  'Ví HLV chỉ bị trừ khi bạn duyệt.',
            ),
            const SizedBox(height: AppSpacing.md),
            AppCard(
              child: Row(
                children: [
                  Icon(AppIcons.web, color: context.colors.primary),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Text(
                      'Quản lý phòng tập, bộ môn, sản phẩm, báo cáo… vui lòng dùng trang quản trị Web.',
                      style: context.text.small,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
