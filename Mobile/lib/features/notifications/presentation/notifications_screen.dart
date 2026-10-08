import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/data/data_revision.dart';
import '../../../core/icons/app_icons.dart';
import '../../../core/theme/theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../auth/presentation/providers/session_provider.dart';
import '../data/notification_repository_provider.dart';
import '../domain/entities/app_notification.dart';
import 'notification_tile.dart';
import 'providers/notification_providers.dart';

/// N01 — Thông báo: lọc chưa đọc, đánh dấu đã đọc, chạm để điều hướng.
class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  bool _unreadOnly = false;

  Future<void> _open(AppNotification n) async {
    final user = ref.read(currentUserProvider);
    if (!n.isRead) {
      await ref.read(notificationRepositoryProvider).markRead(n.id);
      ref.read(dataRevisionProvider.notifier).bump();
    }
    if (!mounted || user == null) return;
    final target = notificationTarget(n, user.role);
    if (target != null) {
      await context.push(target);
    } else {
      await showAppBottomSheet<void>(
        context: context,
        title: n.title,
        builder: (ctx) => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(n.body, style: ctx.text.body),
            if (n.reason != null) ...[
              const SizedBox(height: AppSpacing.sm),
              Text('Lý do: ${n.reason}', style: ctx.text.small),
            ],
          ],
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final value = ref.watch(notificationsProvider(_unreadOnly));
    return AppScaffold(
      title: 'Thông báo',
      actions: [
        IconButton(
          tooltip: 'Đánh dấu tất cả đã đọc',
          icon: const Icon(AppIcons.read),
          onPressed: () => runAction(context, () async {
            await ref.read(notificationRepositoryProvider).markAllRead();
            ref.read(dataRevisionProvider.notifier).bump();
          }, success: 'Đã đánh dấu tất cả là đã đọc.'),
        ),
      ],
      body: Column(
        children: [
          const SizedBox(height: AppSpacing.sm),
          SegmentedTabs<bool>(
            selected: _unreadOnly,
            onChanged: (v) => setState(() => _unreadOnly = v),
            options: const [SegmentOption(false, 'Tất cả'), SegmentOption(true, 'Chưa đọc')],
          ),
          const SizedBox(height: AppSpacing.xs),
          Expanded(
            child: AsyncValueView(
              value: value,
              onRetry: () => ref.invalidate(notificationsProvider(_unreadOnly)),
              isEmpty: (l) => l.isEmpty,
              empty: EmptyState(
                icon: AppIcons.notification,
                title: _unreadOnly ? 'Không có thông báo chưa đọc' : 'Chưa có thông báo',
              ),
              data: (list) => RefreshIndicator.adaptive(
                onRefresh: () => ref.refresh(notificationsProvider(_unreadOnly).future),
                child: ListView.separated(
                  physics: const AlwaysScrollableScrollPhysics(),
                  itemCount: list.length,
                  separatorBuilder: (_, _) => const Divider(),
                  itemBuilder: (_, i) => NotificationTile(item: list[i], onTap: () => _open(list[i])),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
