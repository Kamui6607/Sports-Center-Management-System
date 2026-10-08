import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_routes.dart';
import '../../../app/shell/header_actions.dart';
import '../../../core/config/env.dart';
import '../../../core/icons/app_icons.dart';
import '../../../core/theme/theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../auth/domain/entities/app_user.dart';
import '../../auth/presentation/auth_labels.dart';
import '../../auth/presentation/providers/session_provider.dart';

/// M15 / H15 / R07 — Tài khoản (menu theo vai trò, thay sidebar web).
class AccountScreen extends ConsumerWidget {
  const AccountScreen({super.key});

  Future<void> _logout(BuildContext context, WidgetRef ref) async {
    final ok = await showConfirmSheet(
      context: context,
      title: 'Đăng xuất?',
      message: 'Bạn sẽ cần đăng nhập lại để tiếp tục.',
      confirmLabel: 'Đăng xuất',
    );
    if (ok) await ref.read(sessionProvider.notifier).logout();
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    if (user == null) return const SizedBox.shrink();
    final c = context.colors;
    void go(String route) => context.push(route);
    return AppScaffold(
      title: 'Tài khoản',
      actions: const [HeaderActions(showChat: false)],
      body: ListView(
        padding: EdgeInsets.all(context.screenPadding),
        children: [
          AppCard(
            onTap: () => go(AppRoutes.profileEdit),
            child: Row(
              children: [
                AppAvatar(name: user.fullName, imageUrl: user.avatarUrl, size: AppSizes.avatarLg),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(user.fullName, style: context.text.title),
                      Text(user.email, style: context.text.small.copyWith(color: c.textMuted)),
                      const SizedBox(height: AppSpacing.xxs),
                      StatusLabel(user.role.label, StatusTone.brand).tag(dense: true),
                    ],
                  ),
                ),
                Icon(AppIcons.edit, color: c.textMuted),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          ...switch (user.role) {
            UserRole.member => [
              MenuList(
                title: 'Tập luyện',
                items: [
                  MenuItemData(icon: AppIcons.course, label: 'Khóa học của tôi', onTap: () => go(AppRoutes.myCourses)),
                  MenuItemData(
                    icon: AppIcons.training,
                    label: 'Lộ trình tập luyện',
                    onTap: () => go(AppRoutes.training),
                  ),
                  MenuItemData(
                    icon: AppIcons.attendance,
                    label: 'Chuyên cần & điểm danh',
                    onTap: () => go(AppRoutes.attendance),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.lg),
              MenuList(
                title: 'Mua sắm & thanh toán',
                items: [
                  MenuItemData(icon: AppIcons.order, label: 'Đơn hàng', onTap: () => go(AppRoutes.orders)),
                  MenuItemData(icon: AppIcons.invoice, label: 'Hóa đơn', onTap: () => go(AppRoutes.invoices)),
                  MenuItemData(
                    icon: AppIcons.refund,
                    label: 'Hủy khóa & hoàn tiền',
                    onTap: () => go(AppRoutes.refunds),
                  ),
                ],
              ),
            ],
            UserRole.coach => [
              MenuList(
                title: 'Huấn luyện',
                items: [
                  MenuItemData(
                    icon: AppIcons.star,
                    label: 'Đánh giá nhận được',
                    onTap: () => go(AppRoutes.coachFeedback),
                  ),
                  MenuItemData(icon: AppIcons.add, label: 'Tạo khóa học mới', onTap: () => go(AppRoutes.createClass)),
                ],
              ),
              const SizedBox(height: AppSpacing.lg),
              MenuList(
                title: 'Mua sắm',
                items: [
                  MenuItemData(icon: AppIcons.shop, label: 'Cửa hàng', onTap: () => go(AppRoutes.shop)),
                  MenuItemData(icon: AppIcons.order, label: 'Đơn hàng', onTap: () => go(AppRoutes.orders)),
                ],
              ),
            ],
            UserRole.manager => [
              MenuList(
                title: 'Chức năng khác — vui lòng dùng Web',
                items: [
                  for (final (icon, label) in const [
                    (AppIcons.location, 'Phòng tập & bộ môn'),
                    (AppIcons.bag, 'Sản phẩm & tồn kho'),
                    (AppIcons.users, 'Người dùng & hồ sơ'),
                    (AppIcons.trend, 'Báo cáo doanh thu'),
                    (AppIcons.ban, 'Phạt chuyên cần & khiếu nại'),
                  ])
                    MenuItemData(
                      icon: icon,
                      label: label,
                      subtitle: 'Quản trị nặng — chỉ có trên Web',
                      trailing: Icon(AppIcons.web, size: AppSizes.icon, color: c.textMuted),
                      onTap: () => AppSnackbar.info(context, '"$label" chỉ có trên trang quản trị Web.'),
                    ),
                ],
              ),
            ],
          },
          const SizedBox(height: AppSpacing.lg),
          MenuList(
            title: 'Cài đặt',
            items: [
              MenuItemData(icon: AppIcons.user, label: 'Hồ sơ cá nhân', onTap: () => go(AppRoutes.profileEdit)),
              MenuItemData(icon: AppIcons.lock, label: 'Đổi mật khẩu', onTap: () => go(AppRoutes.changePassword)),
              if (Env.useMock)
                MenuItemData(
                  icon: AppIcons.settings,
                  label: 'Công cụ phát triển (mock)',
                  onTap: () => go(AppRoutes.devTools),
                ),
              MenuItemData(
                icon: AppIcons.logout,
                label: 'Đăng xuất',
                danger: true,
                trailing: const SizedBox.shrink(),
                onTap: () => _logout(context, ref),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          Center(
            child: Text('pulse. Sports Center · v1.0.0', style: context.text.caption.copyWith(color: c.textMuted)),
          ),
          const SizedBox(height: AppSpacing.xl),
        ],
      ),
    );
  }
}
