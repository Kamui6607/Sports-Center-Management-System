import 'package:flutter/material.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/icons/app_icons.dart';
import '../../../core/theme/theme.dart';
import '../../../core/utils/vn_time.dart';
import '../../../core/widgets/icon_tile.dart';
import '../../auth/domain/entities/app_user.dart';
import '../domain/entities/app_notification.dart';

/// Icon + tone theo loại thông báo.
(IconData, StatusTone) notificationStyle(NotificationType t) => switch (t) {
  NotificationType.chatMessage => (AppIcons.chat, StatusTone.info),
  NotificationType.upcomingClass ||
  NotificationType.enrollmentConfirmed ||
  NotificationType.newClass => (AppIcons.calendar, StatusTone.brand),
  NotificationType.scheduleCancelled ||
  NotificationType.enrollmentCancelled => (AppIcons.sessionCancelled, StatusTone.danger),
  NotificationType.scheduleUpdated || NotificationType.scheduleRoomChanged => (AppIcons.transfer, StatusTone.warning),
  NotificationType.trainingPlanAssigned => (AppIcons.training, StatusTone.brand),
  NotificationType.classApproved || NotificationType.withdrawalApproved => (AppIcons.success, StatusTone.success),
  NotificationType.classRejected || NotificationType.withdrawalRejected => (AppIcons.error, StatusTone.danger),
  NotificationType.attendanceWarning || NotificationType.attendancePenalty => (AppIcons.warning, StatusTone.warning),
  NotificationType.attendancePenaltyRevoked => (AppIcons.verified, StatusTone.success),
  NotificationType.paymentSuccess => (AppIcons.payment, StatusTone.success),
  NotificationType.paymentRefunded => (AppIcons.refund, StatusTone.info),
  NotificationType.orderUpdated => (AppIcons.order, StatusTone.brand),
  NotificationType.memberRegistered || NotificationType.general => (AppIcons.notification, StatusTone.neutral),
};

/// Điều hướng khi chạm thông báo (theo `metadata` và vai trò). `null` = không điều hướng.
String? notificationTarget(AppNotification n, UserRole role) {
  final m = n.metadata;
  final classId = m['classId'];
  switch (role) {
    case UserRole.member:
      if (m['senderId'] != null) return AppRoutes.chatRoom(m['senderId']!);
      if (m['orderId'] != null) return AppRoutes.order(m['orderId']!);
      if (m['refundId'] != null) return AppRoutes.refunds;
      if (m['penaltyId'] != null || n.type == NotificationType.attendanceWarning) return AppRoutes.attendance;
      if (m['planId'] != null) return AppRoutes.trainingPlan(m['planId']!);
      if (m['scheduleId'] != null) return AppRoutes.mySession(m['scheduleId']!);
      if (n.type == NotificationType.newClass && classId != null) return AppRoutes.classDetail(classId);
      if (classId != null) return AppRoutes.myCourse(classId);
    case UserRole.coach:
      if (m['senderId'] != null) return AppRoutes.chatRoom(m['senderId']!);
      if (m['orderId'] != null) return AppRoutes.order(m['orderId']!);
      if (n.type == NotificationType.withdrawalApproved || n.type == NotificationType.withdrawalRejected) {
        return AppRoutes.coachWallet;
      }
      if (classId != null) return AppRoutes.coachClass(classId);
    case UserRole.manager:
      if (m['coachProfileId'] != null) return AppRoutes.reviewCv(m['coachProfileId']!);
      if (m['refundId'] != null) return AppRoutes.reviewRefund(m['refundId']!);
      if (m['transactionId'] != null) return AppRoutes.reviewWithdrawal(m['transactionId']!);
      if (m['orderId'] != null) return AppRoutes.managerOrder(m['orderId']!);
      if (classId != null) return AppRoutes.reviewClass(classId);
      return AppRoutes.managerApprovals;
  }
  return null;
}

/// Một thông báo (đậm + chấm khi chưa đọc, nội dung dài thu gọn).
class NotificationTile extends StatelessWidget {
  const NotificationTile({super.key, required this.item, required this.onTap, this.dense = false});

  final AppNotification item;
  final VoidCallback onTap;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final (icon, tone) = notificationStyle(item.type);
    final colors = context.tones.of(tone);
    final c = context.colors;
    return Semantics(
      button: true,
      label: '${item.isRead ? '' : 'Chưa đọc. '}${item.title}. ${item.body}',
      excludeSemantics: true,
      child: InkWell(
        onTap: onTap,
        child: Container(
          color: item.isRead ? null : colors.background.withValues(alpha: 0.5),
          padding: EdgeInsets.symmetric(horizontal: dense ? 0 : context.screenPadding, vertical: AppSpacing.sm),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              IconTile(icon, tone: tone),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            item.title,
                            style: (item.isRead ? context.text.label : context.text.bodyStrong).copyWith(color: c.text),
                          ),
                        ),
                        if (!item.isRead)
                          Container(
                            width: AppSizes.dot - 2,
                            height: AppSizes.dot - 2,
                            decoration: BoxDecoration(
                              color: context.tones.of(StatusTone.danger).foreground,
                              shape: BoxShape.circle,
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.xxs),
                    Text(
                      item.body,
                      maxLines: dense ? 2 : 4,
                      overflow: TextOverflow.ellipsis,
                      style: context.text.small.copyWith(color: c.textMuted),
                    ),
                    if (item.reason != null)
                      Text(
                        'Lý do: ${item.reason}',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: context.text.caption.copyWith(color: c.textMuted),
                      ),
                    const SizedBox(height: AppSpacing.xxs),
                    Text(
                      VnTime.relative(item.createdAt, DateTime.now()),
                      style: context.text.caption.copyWith(color: c.textMuted),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
