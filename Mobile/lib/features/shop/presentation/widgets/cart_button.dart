import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/widgets/widgets.dart';
import '../../../auth/domain/entities/app_user.dart';
import '../../../auth/presentation/providers/session_provider.dart';
import '../providers/shop_providers.dart';

/// Icon giỏ hàng có badge (số dòng) trên header cửa hàng — chỉ hiện với người mua (Member, Coach).
class CartButton extends ConsumerWidget {
  const CartButton({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    if (user == null || user.role == UserRole.manager) return const SizedBox.shrink();
    return AppIconButton(
      icon: AppIcons.cart,
      tooltip: 'Giỏ hàng',
      badgeCount: ref.watch(cartCountProvider),
      onPressed: () => context.push(AppRoutes.cart),
    );
  }
}
