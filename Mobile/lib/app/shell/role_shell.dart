import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/icons/app_icons.dart';
import '../../core/theme/theme.dart';
import '../../features/notifications/presentation/providers/unread_providers.dart';

class ShellDestination {
  const ShellDestination(this.icon, this.label);

  final IconData icon;
  final String label;
}

/// Khung bottom navigation (thay sidebar của web). Mỗi tab giữ stack riêng.
class RoleShell extends ConsumerWidget {
  const RoleShell({super.key, required this.navigationShell, required this.destinations});

  final StatefulNavigationShell navigationShell;
  final List<ShellDestination> destinations;

  static const member = [
    ShellDestination(AppIcons.home, 'Trang chủ'),
    ShellDestination(AppIcons.course, 'Khóa học'),
    ShellDestination(AppIcons.schedule, 'Lịch tập'),
    ShellDestination(AppIcons.shop, 'Cửa hàng'),
    ShellDestination(AppIcons.account, 'Tài khoản'),
  ];

  static const coach = [
    ShellDestination(AppIcons.dashboard, 'Tổng quan'),
    ShellDestination(AppIcons.schedule, 'Lịch dạy'),
    ShellDestination(AppIcons.course, 'Khóa học'),
    ShellDestination(AppIcons.wallet, 'Ví'),
    ShellDestination(AppIcons.account, 'Tài khoản'),
  ];

  static const manager = [
    ShellDestination(AppIcons.dashboard, 'Tổng quan'),
    ShellDestination(AppIcons.approvals, 'Duyệt'),
    ShellDestination(AppIcons.account, 'Tài khoản'),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.watch(realtimeBridgeProvider);
    return Scaffold(
      body: navigationShell,
      bottomNavigationBar: DecoratedBox(
        decoration: BoxDecoration(
          border: Border(top: BorderSide(color: context.colors.border)),
        ),
        child: NavigationBar(
          selectedIndex: navigationShell.currentIndex,
          labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
          onDestinationSelected: (i) => navigationShell.goBranch(i, initialLocation: i == navigationShell.currentIndex),
          destinations: [for (final d in destinations) NavigationDestination(icon: Icon(d.icon), label: d.label)],
        ),
      ),
    );
  }
}
