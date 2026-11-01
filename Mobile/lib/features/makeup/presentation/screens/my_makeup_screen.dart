import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/widgets/widgets.dart';
import '../makeup_widgets.dart';
import '../providers/makeup_providers.dart';

/// Học viên — Yêu cầu học bù của tôi (chạm ⇒ mở buổi đã vắng để xem / chọn buổi bù).
class MyMakeupRequestsScreen extends ConsumerWidget {
  const MyMakeupRequestsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(myMakeupRequestsProvider);
    return AppScaffold(
      title: 'Học bù của tôi',
      body: AsyncValueView(
        value: value,
        onRetry: () => ref.invalidate(myMakeupRequestsProvider),
        data: (rows) => rows.isEmpty
            ? const EmptyState(
                icon: AppIcons.absence,
                title: 'Chưa có yêu cầu học bù',
                message: 'Khi báo vắng một buổi, bạn có thể xin buổi học bù.',
              )
            : RefreshableScroll(
                onRefresh: () => ref.refresh(myMakeupRequestsProvider.future),
                children: [
                  for (final r in rows) ...[
                    AppCard(
                      onTap: () => context.push(AppRoutes.mySession(r.missed.id)),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(child: Text(r.missed.className, style: context.text.bodyStrong)),
                              r.status.status.tag(dense: true),
                            ],
                          ),
                          const SizedBox(height: AppSpacing.xxs),
                          Text('Buổi vắng: ${makeupSessionLabel(r.missed)}', style: context.text.small),
                          if (r.target != null)
                            Text('Học bù: ${makeupSessionLabel(r.target!)}', style: context.text.small),
                          if (r.rejectReason != null)
                            Text(
                              'Lý do từ chối: ${r.rejectReason}',
                              style: context.text.caption.copyWith(color: context.colors.textMuted),
                            ),
                        ],
                      ),
                    ),
                    const SizedBox(height: AppSpacing.sm),
                  ],
                ],
              ),
      ),
    );
  }
}
