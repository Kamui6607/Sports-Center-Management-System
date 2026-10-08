import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/icons/app_icons.dart';
import '../../core/widgets/widgets.dart';
import '../../features/notifications/presentation/providers/unread_providers.dart';
import '../router/app_routes.dart';

/// Nút Tin nhắn + Thông báo (có badge) trên app bar các tab chính.
class HeaderActions extends ConsumerWidget {
  const HeaderActions({super.key, this.showChat = true});

  final bool showChat;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final messages = ref.watch(unreadMessagesProvider).value ?? 0;
    final notis = ref.watch(unreadNotificationsProvider).value ?? 0;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (showChat)
          AppIconButton(
            icon: AppIcons.chat,
            tooltip: 'Tin nhắn',
            badgeCount: messages,
            onPressed: () => context.push(AppRoutes.chat),
          ),
        AppIconButton(
          icon: AppIcons.notification,
          tooltip: 'Thông báo',
          badgeCount: notis,
          onPressed: () => context.push(AppRoutes.notifications),
        ),
      ],
    );
  }
}
