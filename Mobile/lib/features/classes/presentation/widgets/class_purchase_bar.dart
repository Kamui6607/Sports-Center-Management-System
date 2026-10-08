import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/data/data_revision.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/money.dart';
import '../../../../core/widgets/widgets.dart';
import '../../../auth/domain/entities/app_user.dart';
import '../../../payments/data/payment_repository_provider.dart';
import '../../domain/entities/course.dart';

/// Thanh CTA dính đáy theo tình trạng mua.
class ClassPurchaseBar extends ConsumerStatefulWidget {
  const ClassPurchaseBar({super.key, required this.detail, required this.user});

  final CourseDetail detail;
  final AppUser? user;

  @override
  ConsumerState<ClassPurchaseBar> createState() => _ClassPurchaseBarState();
}

class _ClassPurchaseBarState extends ConsumerState<ClassPurchaseBar> {
  bool _busy = false;

  Future<void> _buy() async {
    final course = widget.detail.course;
    final confirmed = await showConfirmSheet(
      context: context,
      title: 'Xác nhận mua khóa học',
      message:
          'Bạn sẽ thanh toán bằng chuyển khoản VietQR. Sau khi thanh toán thành công, hệ thống tự ghi danh bạn vào '
          '${widget.detail.sessions.length} buổi sắp diễn ra.',
      confirmLabel: 'Thanh toán ${Money.format(course.price)}',
      extra: AppCard(
        color: context.colors.surfaceMuted,
        child: Column(
          children: [
            KeyValueRow(label: 'Khóa học', value: course.name),
            KeyValueRow(label: 'HLV', value: course.coach.fullName),
            KeyValueRow(label: 'Số buổi được ghi danh', value: '${widget.detail.sessions.length}'),
            const Divider(),
            KeyValueRow(label: 'Tổng tiền', value: Money.format(course.price), emphasize: true),
          ],
        ),
      ),
      warning: 'Chỉ được hủy khóa và hoàn tiền khi còn ≥ 24 giờ trước buổi khai giảng.',
    );
    if (!confirmed || !mounted) return;
    setState(() => _busy = true);
    final checkout = await runAction(context, () => ref.read(paymentRepositoryProvider).checkoutCourse(course.id));
    if (!mounted) return;
    setState(() => _busy = false);
    if (checkout != null) {
      ref.read(dataRevisionProvider.notifier).bump();
      await context.push(AppRoutes.payment(checkout.paymentId));
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = widget.detail;
    final user = widget.user;
    final course = d.course;
    if (user != null && user.role != UserRole.member) return const SizedBox.shrink();
    final Widget action = switch (d.purchase.status) {
      _ when user == null => AppButton(
        expand: true,
        label: 'Đăng nhập để mua',
        icon: AppIcons.lock,
        onPressed: () =>
            context.push('${AppRoutes.login}?from=${Uri.encodeComponent(AppRoutes.classDetail(course.id))}'),
      ),
      PurchaseStatus.purchased => AppButton.outline(
        expand: true,
        label: 'Xem khóa của tôi',
        onPressed: () => context.push(AppRoutes.myCourse(course.id)),
      ),
      PurchaseStatus.pendingPayment => AppButton.secondary(
        expand: true,
        label: 'Tiếp tục thanh toán',
        onPressed: () => context.push(AppRoutes.payment(d.purchase.pendingPaymentId!)),
      ),
      PurchaseStatus.none => AppButton(
        expand: true,
        label: 'Mua khóa học',
        loading: _busy,
        onPressed: d.purchase.canBuy ? _buy : null,
      ),
    };
    return StickyBottomBar(
      child: Row(
        children: [
          Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Trọn khóa', style: context.text.caption.copyWith(color: context.colors.textMuted)),
              MoneyText(course.price, style: context.text.titleSmall),
            ],
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(child: action),
        ],
      ),
    );
  }
}
